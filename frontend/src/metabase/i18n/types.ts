/** Entry in a dictionary used for content translation */
export type ContentTranslationDictionaryEntry = {
  locale: string;
  msgid: string;
  msgstr: string;
};

/** A dictionary used for content translation */
export type ContentTranslationDictionary = ContentTranslationDictionaryEntry[];

export type ContentTranslationContextObject = {
  shouldLocalize: boolean;
  locale?: string;
  dictionary?: ContentTranslationDictionary;
};

/** Mapping of msgid to msgstr. This is a dictionary for a single locale, so no
 * locale information is stored in it */
export type DictionaryForLocale = Record<string, string>;
