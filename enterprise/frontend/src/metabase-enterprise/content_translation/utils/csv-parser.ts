import type { DictionaryArrayRow } from "metabase-types/api/content-translation";

export interface ParseCSVResult {
  data: DictionaryArrayRow[];
  errors: string[];
}

export const parseCSV = (csvContent: string): ParseCSVResult => {
  const lines = csvContent.trim().split("\n");
  const errors: string[] = [];
  const data: DictionaryArrayRow[] = [];

  if (lines.length === 0) {
    errors.push("CSV file is empty");
    return { data, errors };
  }

  // Skip header row (assumed to be first line)
  const dataLines = lines.slice(1);

  dataLines.forEach((line, index) => {
    const lineNumber = index + 2; // +2 because we're 1-indexed and skipped header

    // Simple CSV parsing - split by comma, but handle quoted fields
    const fields = parseCSVLine(line);

    if (fields.length !== 3) {
      errors.push(
        `Row ${lineNumber}: Expected 3 columns (Language, String, Translation), got ${fields.length}`,
      );
      return;
    }

    const [locale, msgid, msgstr] = fields.map((field) => field.trim());

    if (!locale) {
      errors.push(`Row ${lineNumber}: Language cannot be empty`);
      return;
    }

    if (!msgid) {
      errors.push(`Row ${lineNumber}: String cannot be empty`);
      return;
    }

    if (!msgstr) {
      errors.push(`Row ${lineNumber}: Translation cannot be empty`);
      return;
    }

    data.push({ locale, msgid, msgstr });
  });

  return { data, errors };
};

// Simple CSV line parser that handles quoted fields
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      result.push(current);
      current = "";
      i++;
    } else {
      current += char;
      i++;
    }
  }

  result.push(current);
  return result;
};

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsText(file);
  });
};
