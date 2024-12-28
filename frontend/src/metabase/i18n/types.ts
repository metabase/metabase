/** Entry in a dictionary used for dynamic content localization */
export type I18nDictionaryEntry = [
  // Locale code e.g. "es"
  string,
  // Msgid e.g. "Hello"
  string,
  // Msgstr e.g. "Hola"
  string,
  // Context e.g. "greeting"
  string,
];

/** A dictionary used for dynamic content localization */
export type I18nDictionary = I18nDictionaryEntry[];
