import type { DictionaryArray, DictionaryArrayRow } from "metabase-types/api";

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
