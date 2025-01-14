import { type ReactNode, createContext, useContext } from "react";

import { useLocale, useUserSetting } from "metabase/common/hooks";

import {
  type ContentTranslationContextObject,
  type ContentTranslationDictionary,
  isValidContentTranslationDictionary,
} from "../types";
import { translateProperty, translateString } from "../utils";

export const ContentTranslationContext =
  createContext<ContentTranslationContextObject>({
    shouldLocalize: true,
    dictionary: [],
    locale: "fr", //hard-code for now
  });

export const ContentTranslationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // This needs to be an instance level setting
  const [stringifiedDictionary, setStringifiedDictionary] =
    useUserSetting("dynamic-dictionary");

  let dictionary: ContentTranslationDictionary | null = [];
  try {
    const parsedDictionary = JSON.parse(stringifiedDictionary || "");
    dictionary = isValidContentTranslationDictionary(parsedDictionary)
      ? parsedDictionary
      : null;
    if (!dictionary) {
      throw new Error("Invalid dictionary", parsedDictionary);
    }
  } catch (e) {
    console.error(
      "Failed to parse content translation dictionary from settings",
      e,
    );
  }

  const setDictionary = (newDictionary: ContentTranslationDictionary) => {
    setStringifiedDictionary(JSON.stringify(newDictionary));
  };

  if (!dictionary?.length) {
    // hard code this for now
    setDictionary([["en", "Monkeys", "Monkeys!!!!"]]);
  }
  const locale = useLocale();

  const contextValue = {
    dictionary: dictionary || [],
    locale,
    setDictionary,
    shouldLocalize: true,
  };

  return (
    <ContentTranslationContext.Provider value={contextValue}>
      {children}
    </ContentTranslationContext.Provider>
  );
};

export const useTranslateContent = () => {
  const context = useContext(ContentTranslationContext);
  const tc = (obj: any, property: string) =>
    translateProperty(obj, property, (msgid: string) =>
      translateString(msgid, context),
    );
  return tc;
};
