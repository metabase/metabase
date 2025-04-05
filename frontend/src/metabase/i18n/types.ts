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

/** Mapping of raw strings (sometimes called 'msgids') to translations of these
 * strings (sometimes called 'msgstrs') This is a dictionary for a single
 * locale, so no locale information is stored in it */
export type DictionaryForLocale = Record<string, string>;
