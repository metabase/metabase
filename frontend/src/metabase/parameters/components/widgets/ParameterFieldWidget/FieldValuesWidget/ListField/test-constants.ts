import _ from "underscore";

import type { ContentTranslationFunction } from "metabase/content-translation/types";

export const translateToGerman: ContentTranslationFunction = (msgid) => {
  const dictionary: Record<string, string> = {
    "Marble Shoes": "Marmorschuhe",
    Gadget: "Gerät",
    Widget: "Apparat",
  };
  // Unjustified type cast. FIXME
  return _.get(dictionary, msgid as string, msgid);
};

export const translateToJapanese: ContentTranslationFunction = (msgid) => {
  const dictionary = {
    Products: "グッズ",
  };
  // Unjustified type cast. FIXME
  return _.get(dictionary, msgid as string, msgid);
};
