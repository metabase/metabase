/** Entry in a dictionary used for content translation */
export type ContentTranslationDictionaryEntry = [
  // Locale code e.g. "es"
  string,
  // Msgid e.g. "Hello"
  string,
  // Msgstr e.g. "Hola"
  string,
];

/** A dictionary used for content translation */
export type ContentTranslationDictionary = ContentTranslationDictionaryEntry[];

export const isValidContentTranslationDictionary = (
  obj: unknown,
): obj is ContentTranslationDictionary => {
  if (!Array.isArray(obj)) {
    return false;
  }
  for (const entry of obj) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "string" ||
      typeof entry[2] !== "string"
    ) {
      return false;
    }
  }
  return true;
};

export type LocalizationPattern = {
  actionTypePattern: RegExp;
  fieldPattern: RegExp;
};

export type ContentTranslationContextObject = {
  shouldLocalize: boolean;
  locale?: string;
  dictionary?: ContentTranslationDictionary;
};
