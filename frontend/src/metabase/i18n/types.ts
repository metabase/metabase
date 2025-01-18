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
