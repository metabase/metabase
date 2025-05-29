export type DictionaryArrayRow = {
  locale: string;
  msgid: string;
  msgstr: string;
};

export type DictionaryArray = DictionaryArrayRow[];

/** Translations retrieved from the BE have ids */
export type RetrievedDictionaryArrayRow = DictionaryArrayRow & { id: number };

export type DictionaryResponse = {
  data: RetrievedDictionaryArrayRow[];
};

export const isDictionaryArrayRow = (
  item: unknown,
): item is DictionaryArrayRow => {
  return (
    typeof item === "object" &&
    item !== null &&
    "locale" in item &&
    typeof item.locale === "string" &&
    "msgid" in item &&
    typeof item.msgid === "string" &&
    "msgstr" in item &&
    typeof item.msgstr === "string"
  );
};

export const isDictionaryArray = (data: unknown): data is DictionaryArray => {
  return Array.isArray(data) && data.every(isDictionaryArrayRow);
};
