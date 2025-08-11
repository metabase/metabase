import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";
import type { DictionaryResponse } from "metabase-types/api";

export const translateToGerman: ContentTranslationFunction = (msgid) => {
  const dictionary: Record<string, string> = {
    "Marble Shoes": "Marmorschuhe",
    Gadget: "Gerät",
    Widget: "Apparat",
  };
  return _.get(dictionary, msgid as string, msgid);
};

export const translateToJapanese: ContentTranslationFunction = (msgid) => {
  const dictionary = {
    Products: "グッズ",
  };
  return _.get(dictionary, msgid as string, msgid);
};

export const portugueseDictionary: DictionaryResponse["data"] = [
  { id: 0, locale: "pt_BR", msgid: "Doohickey", msgstr: "Treco" },
  { id: 1, locale: "pt_BR", msgid: "Gizmo", msgstr: "Aparelho" },
  { id: 2, locale: "pt_BR", msgid: "Gadget", msgstr: "Dispositivo" },
  { id: 3, locale: "pt_BR", msgid: "Widget", msgstr: "Engenhoca" },
];
