import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/i18n/types";

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
