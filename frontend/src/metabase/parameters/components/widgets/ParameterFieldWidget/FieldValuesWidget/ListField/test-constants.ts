import type { ContentTranslationFunction } from "metabase/content-translation/types";

export const translateToGerman: ContentTranslationFunction = (msgid) => {
  const dictionary: Record<string, string> = {
    "Marble Shoes": "Marmorschuhe",
    Gadget: "Gerät",
    Widget: "Apparat",
  };
  return typeof msgid === "string" ? (dictionary[msgid] ?? msgid) : msgid;
};

export const translateToJapanese: ContentTranslationFunction = (msgid) => {
  const dictionary: Record<string, string> = {
    Products: "グッズ",
  };
  return typeof msgid === "string" ? (dictionary[msgid] ?? msgid) : msgid;
};
