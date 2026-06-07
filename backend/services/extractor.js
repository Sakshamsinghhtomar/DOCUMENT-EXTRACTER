const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');

// Helper to convert local file to base64
const fileToBase64 = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
};

// 1. Text extraction based on file type
const extractRawText = async (filePath, fileType) => {
  try {
    if (fileType.includes('pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } else if (fileType.includes('officedocument.wordprocessingml') || fileType.includes('msword') || filePath.endsWith('.docx')) {
      const data = await mammoth.extractRawText({ path: filePath });
      return data.value || '';
    } else if (fileType.includes('officedocument.spreadsheetml') || fileType.includes('excel') || filePath.endsWith('.xlsx')) {
      const workbook = xlsx.readFile(filePath);
      let text = '';
      workbook.SheetNames.forEach((sheetName) => {
        text += `--- Sheet: ${sheetName} ---\n`;
        const worksheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(worksheet);
        text += csv + '\n';
      });
      return text;
    } else if (fileType.includes('image') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      // Local OCR fallback using Tesseract.js
      console.log('Running local OCR on image:', filePath);
      const result = await Tesseract.recognize(filePath, 'eng', {
        logger: (m) => console.log(`OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`)
      });
      return result.data.text || '';
    }
    return '';
  } catch (error) {
    console.error('Error during raw text extraction:', error);
    return '';
  }
};

// 2. Local fallback parser (Regex-based & Heuristic-based)
const runLocalExtraction = (text, fields, filename = '') => {
  const result = {};
  const cleanedText = text.toLowerCase();

  // Seed default templates helper data if the file is an insurance document
  const isInsurance = cleanedText.includes('policy') || cleanedText.includes('insur') || filename.toLowerCase().includes('insurance') || filename.toLowerCase().includes('policy');

  fields.forEach((field) => {
    let extractedValue = '';
    let confidence = 0.3; // Default low confidence if not found

    const fieldName = field.name.toLowerCase();

    // Smart Date-Range helper (matches "02/06/2026 ... to ... 01/06/2027")
    const dateRangeMatch = text.match(/(?:period\s+of\s+cover|period\s+of\s+insurance|duration\s+of\s+cover|cover\s+period)\s*[:\-–|]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\s*(?:[^\n\r]*?)\s+to\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);

    if (fieldName.includes('name') || fieldName.includes('insured')) {
      // Pattern 1: Table layouts and colons
      const match = text.match(/(?:insured's\s+name|insured\s+name|name\s+of\s+insured|proposer\s+name|owner|proposer)\s*[:\-–|]*\s*([^|\n\r\t]+)/i);
      if (match && match[1]) {
        let nameVal = match[1].trim();
        const parts = nameVal.split(/\s{2,}/);
        if (parts.length > 0) {
          nameVal = parts[0].trim();
        }
        nameVal = nameVal.replace(/^[:\-–|\s]+/, '').trim();
        if (nameVal && nameVal.length >= 2) {
          extractedValue = nameVal;
          confidence = 0.9;
        }
      }
      // Pattern 2: Capitalized strings after detail block
      if (!extractedValue) {
        const detailsIdx = cleanedText.indexOf('insured details');
        if (detailsIdx !== -1) {
          const sub = text.substring(detailsIdx, detailsIdx + 200);
          const nameMatch = sub.match(/(?:name|insured's\s+name)\s*[:\-–|]*\s*([A-Z\s]{3,30})/);
          if (nameMatch && nameMatch[1]) {
            extractedValue = nameMatch[1].trim().split(/\s{2,}/)[0].trim();
            confidence = 0.85;
          }
        }
      }
      // Pattern 3: Simple colon-based name
      if (!extractedValue) {
        const match = text.match(/(?:insured|proposer)\s*[:\-–|]+\s*([^|\n\r\t]+)/i);
        if (match && match[1]) {
          let nameVal = match[1].trim();
          const parts = nameVal.split(/\s{2,}/);
          if (parts.length > 0) {
            nameVal = parts[0].trim();
          }
          nameVal = nameVal.replace(/^[:\-–|\s]+/, '').trim();
          if (nameVal && nameVal.length >= 2 && !nameVal.toLowerCase().includes('detail') && !nameVal.toLowerCase().includes('address')) {
            extractedValue = nameVal;
            confidence = 0.8;
          }
        }
      }
    } else if (fieldName.includes('policy') && fieldName.includes('number')) {
      const match = text.match(/(?:policy\s+no\.?|policy\s+number|policy\s+id|contract\s+no\.?|policy\s+schedule)\s*[:\-–|]*\s*([a-zA-Z0-9\/\-]+)/i);
      if (match && match[1]) {
        extractedValue = match[1].trim();
        confidence = 0.9;
      }
    } else if (fieldName.includes('vehicle') && fieldName.includes('number')) {
      // Locate registration label prefix context
      const match = text.match(/(?:vehicle\s+no\.?|registration\s+no\.?|reg\s+no\.?|vehicle\s+number|regn\s+no\.?|registration\s+number|reg\.\s*no\.?)\s*[:\-–|]*\s*([^|\n\r\t]+)/i);
      
      let contextVal = '';
      if (match && match[1]) {
        contextVal = match[1].trim();
      } else {
        // Scan the entire document as a fallback
        contextVal = text;
      }
      
      // Look for standard 10 alphanumeric character vehicle registration pattern:
      // 2 letters (state), 2 digits (district), 1-2 letters (series), 4 digits (unique number)
      const regPattern = /\b([a-zA-Z]{2}[-\s]?\d{2}[-\s]?[a-zA-Z]{1,2}[-\s]?\d{4})\b/;
      const regMatch = contextVal.match(regPattern);
      
      if (regMatch && regMatch[1]) {
        extractedValue = regMatch[1].trim();
        confidence = 0.95;
      } else {
        // Generic fallback for non-standard/temporary numbers
        const simpleMatch = contextVal.match(/\b([a-zA-Z0-9\s\-]{6,15})\b/);
        if (simpleMatch && simpleMatch[1]) {
          extractedValue = simpleMatch[1].trim();
          confidence = 0.7;
        }
      }
    } else if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('contact')) {
      const insuredIdx = cleanedText.indexOf('insured details');
      if (insuredIdx !== -1) {
        let limitIdx = cleanedText.indexOf('policy details', insuredIdx);
        if (limitIdx === -1) {
          limitIdx = cleanedText.indexOf('vehicle details', insuredIdx);
        }
        if (limitIdx === -1) {
          limitIdx = insuredIdx + 500;
        }
        const sub = text.substring(insuredIdx, limitIdx);
        const match = sub.match(/(?:phone|mobile|contact|tel|telephone)\s*(?:no\.?|number)?\s*[:\-–|]*\s*([^|\n\r\t]+)/i);
        if (match && match[1]) {
          let phoneVal = match[1].trim();
          const parts = phoneVal.split(/\s{2,}/);
          if (parts.length > 0) {
            phoneVal = parts[0].trim();
          }
          phoneVal = phoneVal.replace(/^[:\-–|\s\/]+/, '').replace(/[\s\/]+$/, '').trim();
          const digitCount = (phoneVal.match(/\d/g) || []).length;
          if (digitCount >= 5) {
            extractedValue = phoneVal;
            confidence = 0.9;
          } else {
            extractedValue = '';
            confidence = 0.9;
          }
        }
      }
      if (!extractedValue) {
        extractedValue = '';
        confidence = 0.8;
      }
    } else if (fieldName.includes('idv') || fieldName.includes('declared\s+value') || fieldName.includes('declared value')) {
      // Concatenated IDV decoder (resolves pdf-parse cell merging, e.g. 90000009000 -> 9000)
      const decodeConcatenatedIDV = (str) => {
        if (!/^\d+$/.test(str) || str.length < 6) return null;
        const len = str.length;
        for (let l = 3; l <= Math.floor(len / 2); l++) {
          const prefix = str.substring(0, l);
          const suffix = str.substring(len - l);
          if (prefix === suffix) {
            const middle = str.substring(l, len - l);
            if (/^0*$/.test(middle)) {
              return prefix;
            }
          }
        }
        return null;
      };

      // 1. Direct match in Policy Clauses (e.g. "individual covers (OD) in RS:9000")
      const odCoversMatch = text.match(/(?:individual\s+covers\s*\(od\)\s*in\s*rs|individual\s+covers\s*od\s*rs)\s*[:\-–|]*\s*([\d,]+(?:\.\d{2})?)/i);
      
      if (odCoversMatch && odCoversMatch[1]) {
        extractedValue = odCoversMatch[1].trim();
        confidence = 0.95;
      } else {
        // 2. Direct match with number immediately following IDV label
        const match = text.match(/(?:idv|insured\s+declared\s+value|vehicle\s+value)\s*[:\-–|]?\s*(?:rs\.?|\$|usd)?\s*([\d,]+(?:\.\d{2})?)/i);
        if (match && match[1]) {
          const rawNum = match[1].trim();
          const decoded = decodeConcatenatedIDV(rawNum);
          extractedValue = decoded ? decoded : rawNum;
          confidence = 0.85;
        } else {
          // 3. Lookahead search for standard IDV table structure
          let idvIndex = cleanedText.indexOf('insured declared value');
          if (idvIndex === -1) {
            idvIndex = cleanedText.indexOf('idv');
          }
          if (idvIndex !== -1) {
            const sub = cleanedText.substring(idvIndex, idvIndex + 400);
            
            // Specifically search for the word 'vehicle' inside the IDV block
            const vehIdx = sub.indexOf('vehicle');
            if (vehIdx !== -1) {
              const postVeh = sub.substring(vehIdx);
              // Match first large number representing vehicle IDV
              const numMatch = postVeh.match(/\b([1-9]\d{3,15}|\d{1,3}(?:,\d{3}){1,4})\b/);
              if (numMatch) {
                const rawNum = numMatch[1].trim();
                const decoded = decodeConcatenatedIDV(rawNum);
                extractedValue = decoded ? decoded : rawNum;
                confidence = 0.95;
              }
            }
            
            // Fallback to first large number in the block
            if (!extractedValue) {
              const numMatch = sub.match(/\b([1-9]\d{3,15}|\d{1,3}(?:,\d{3}){1,4})\b/);
              if (numMatch && numMatch[1]) {
                const rawNum = numMatch[1].trim();
                const decoded = decodeConcatenatedIDV(rawNum);
                extractedValue = decoded ? decoded : rawNum;
                confidence = 0.9;
              }
            }
          }
        }
      }
    } else if (fieldName.includes('start') || fieldName.includes('from') || fieldName.includes('period')) {
      if (dateRangeMatch) {
        extractedValue = dateRangeMatch[1].trim();
        confidence = 0.9;
      } else {
        const match = text.match(/(?:start\s+date|effective\s+date|from\s+date|date\s+of\s+commencement|period\s+of\s+insurance\s+from|period\s+of\s+cover|cover\s+from)\s*[:\-–|]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|[a-zA-Z]{3,9}\s+\d{1,2},\s*\d{4})/i);
        if (match && match[1]) {
          extractedValue = match[1].trim();
          confidence = 0.85;
        }
      }
    } else if (fieldName.includes('end') || fieldName.includes('expired') || fieldName.includes('expiry') || fieldName.includes('to\s+date')) {
      if (dateRangeMatch) {
        extractedValue = dateRangeMatch[2].trim();
        confidence = 0.9;
      } else {
        const match = text.match(/(?:expiry\s+date|expire\s+date|valid\s+till|to\s+date|expired\s+date|period\s+of\s+cover\s+to|cover\s+to)\s*[:\-–|]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|[a-zA-Z]{3,9}\s+\d{1,2},\s*\d{4})/i);
        if (match && match[1]) {
          extractedValue = match[1].trim();
          confidence = 0.85;
        }
      }
    } else if (fieldName.includes('third party') || fieldName.includes('third_party') || fieldName.includes('tp') || fieldName.includes('liability')) {
      const match = text.match(/(?:total\s+tp\s+premium|calculated\s+tp\s+premium|tp\s+premium|third\s+party\s+premium|third\s+party|tp\s+liability|basic\s+tp|liability\s+premium)\s*(?:\(rs\.?\))?\s*[:\-–|]?\s*(?:rs\.?|\$|usd)?\s*([\d,]+(?:\.\d{2})?)/i);
      if (match && match[1]) {
        extractedValue = match[1].trim();
        confidence = 0.85;
      }
    } else if (fieldName.includes('premium') || fieldName.includes('od') || fieldName.includes('own damage') || fieldName.includes('own_damage')) {
      const match = text.match(/(?:total\s+od\s+premium|calculated\s+od\s+premium|own\s+damage|od\s+premium|basic\s+od)\s*(?:\(rs\.?\))?\s*[:\-–|]?\s*(?:rs\.?|\$|usd)?\s*([\d,]+(?:\.\d{2})?)/i);
      if (match && match[1]) {
        extractedValue = match[1].trim();
        confidence = 0.85;
      }
    } else if (fieldName.includes('ncb') || fieldName.includes('claim\s+bonus')) {
      const match = text.match(/(?:ncb|no\s+claim\s+bonus)\s*[:\-–|]?\s*(\d+%\s*|\d+\s*percent|nil|zero)/i);
      if (match && match[1]) {
        extractedValue = match[1].trim();
        confidence = 0.9;
      }
    }

    // Generic fallback for any other fields requested if no regex matched
    if (!extractedValue) {
      if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('contact')) {
        // Do not use generic fallback for phone/contact numbers to avoid extracting from wrong sections
        extractedValue = '';
        confidence = 0.8;
      } else {
        const regex = new RegExp(`${field.label || field.name}\\s*[:\\-–|]\\s*([^\\n\\r|]+)`, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
          extractedValue = match[1].trim().split(/\s{2,}/)[0].trim();
          confidence = 0.7;
        } else {
          extractedValue = '';
          confidence = 0.1; // Very low confidence since it wasn't matched
        }
      }
    }

    result[field.name] = {
      value: extractedValue,
      confidence: parseFloat(confidence.toFixed(2))
    };
  });

  return result;
};

// 3. AI extraction using Gemini API
const runGeminiExtraction = async (apiKey, filePath, fileType, fields, text) => {
  const fieldsPromptList = fields.map(f => `"${f.name}" (${f.label}, type: ${f.type})`).join(', ');

  const systemInstruction = `You are a precise data extraction agent. Extract the requested fields from the uploaded document.
  For each field, extract its exact value and determine a confidence score between 0.0 and 1.0 based on how clear and unambiguous the extraction was.
  
  CRITICAL RULE FOR CONTACT/PHONE NUMBERS:
  If you are extracting a contact number, phone number, or mobile number, you MUST ONLY extract the number listed under the "INSURED DETAILS" (or Insured details/Insured's details) section of the document. Do NOT extract contact numbers from other sections (such as Policy Issuing Office, Business Channel, Claim Contact, or any other agent/channel contact sections). If there is no contact number given under "INSURED DETAILS" (e.g. it is blank, has placeholder characters like "/" or "/ /", or is not present), you must return null for the value and 0.0 for the confidence.
  
  Return the results ONLY as a JSON object of key-value pairs where the key is the field name, and the value is an object with "value" (string or number or null) and "confidence" (number between 0.0 and 1.0).
  Example format:
  {
    "insured_name": { "value": "John Doe", "confidence": 0.95 },
    "phone_number": { "value": null, "confidence": 0.0 }
  }
  If a field is not present in the document, return null for the value and 0.0 for the confidence. Do not include markdown code block formats in your response, just the raw JSON.`;

  try {
    const isMultimodal = fileType.includes('image') || fileType.includes('pdf');
    let url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    
    let requestBody = {};

    if (isMultimodal) {
      // Gemini can accept base64 image or PDF directly
      console.log('Calling multimodal Gemini API...');
      const base64Data = fileToBase64(filePath);
      
      requestBody = {
        contents: [
          {
            parts: [
              {
                text: `${systemInstruction}\n\nExtract these fields from the attached file: ${fieldsPromptList}`
              },
              {
                inlineData: {
                  mimeType: fileType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      };
    } else {
      // Send extracted text
      console.log('Calling Gemini API with text payload...');
      requestBody = {
        contents: [
          {
            parts: [
              {
                text: `${systemInstruction}\n\nDocument Text:\n${text}\n\nExtract these fields: ${fieldsPromptList}`
              }
            ]
          }
        ]
      };
    }

    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API returned error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    let textResponse = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Clean up response text if markdown is included
    textResponse = textResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    
    return JSON.parse(textResponse);
  } catch (error) {
    console.error('Gemini extraction failed, falling back to local extractor:', error);
    return runLocalExtraction(text, fields, path.basename(filePath));
  }
};

// 4. AI extraction using OpenAI API
const runOpenAIExtraction = async (apiKey, filePath, fileType, fields, text) => {
  const fieldsPromptList = fields.map(f => `"${f.name}" (${f.label}, type: ${f.type})`).join(', ');

  const systemInstruction = `You are a precise data extraction agent. Extract the requested fields from the uploaded document text.
  For each field, extract its exact value and determine a confidence score between 0.0 and 1.0 based on how clear and unambiguous the extraction was.
  
  CRITICAL RULE FOR CONTACT/PHONE NUMBERS:
  If you are extracting a contact number, phone number, or mobile number, you MUST ONLY extract the number listed under the "INSURED DETAILS" (or Insured details/Insured's details) section of the document. Do NOT extract contact numbers from other sections (such as Policy Issuing Office, Business Channel, Claim Contact, or any other agent/channel contact sections). If there is no contact number given under "INSURED DETAILS" (e.g. it is blank, has placeholder characters like "/" or "/ /", or is not present), you must return null for the value and 0.0 for the confidence.
  
  Return the results ONLY as a JSON object of key-value pairs where the key is the field name, and the value is an object with "value" (string or number or null) and "confidence" (number between 0.0 and 1.0).
  Example format:
  {
    "insured_name": { "value": "John Doe", "confidence": 0.95 },
    "phone_number": { "value": null, "confidence": 0.0 }
  }
  If a field is not present in the document, return null for the value and 0.0 for the confidence. Return ONLY raw JSON.`;

  try {
    let messages = [];

    if (fileType.includes('image')) {
      console.log('Calling OpenAI GPT-4o with Image base64...');
      const base64Data = fileToBase64(filePath);
      
      messages = [
        {
          role: 'system',
          content: systemInstruction
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract these fields: ${fieldsPromptList}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${fileType};base64,${base64Data}`
              }
            }
          ]
        }
      ];
    } else {
      // For PDFs, DOCX, XLSX, send extracted text
      console.log('Calling OpenAI API with text payload...');
      messages = [
        {
          role: 'system',
          content: systemInstruction
        },
        {
          role: 'user',
          content: `Document text:\n${text}\n\nExtract these fields: ${fieldsPromptList}`
        }
      ];
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API returned error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    const textResponse = json.choices?.[0]?.message?.content || '';
    
    return JSON.parse(textResponse);
  } catch (error) {
    console.error('OpenAI extraction failed, falling back to local extractor:', error);
    return runLocalExtraction(text, fields, path.basename(filePath));
  }
};

// Main Extraction Orchestrator
const extractDocumentData = async (filePath, fileType, fields, apiSettings = {}) => {
  // Step A: Extract raw text (useful for text files, local OCR, and fallback)
  console.log('Step A: Extracting raw text from file:', filePath);
  const text = await extractRawText(filePath, fileType);
  console.log(`Extracted raw text length: ${text.length} characters`);

  // Step B: Choose Extraction Engine
  const { provider, apiKey } = apiSettings;

  if (provider === 'gemini' && apiKey) {
    return await runGeminiExtraction(apiKey, filePath, fileType, fields, text);
  } else if (provider === 'openai' && apiKey) {
    return await runOpenAIExtraction(apiKey, filePath, fileType, fields, text);
  } else {
    // Local / Mock Extractor
    console.log('Using local rule-based extractor (no API key configured or fallback)');
    return runLocalExtraction(text, fields, path.basename(filePath));
  }
};

module.exports = {
  extractDocumentData,
  extractRawText
};
