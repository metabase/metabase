import { type ReactNode, createContext, useContext, useEffect } from "react";

import { useListContentTranslationsQuery } from "metabase/api/content-translation";
import { useLocale } from "metabase/common/hooks";
import * as Lib from "metabase-lib";

import type { ContentTranslationContextObject } from "../types";
import { translateContentString } from "../utils";

export const ContentTranslationContext =
  createContext<ContentTranslationContextObject>({
    shouldLocalize: true,
    dictionary: [],
    locale: "en",
  });

export const ContentTranslationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const locale = useLocale();

  const { data, error, isLoading } = useListContentTranslationsQuery({
    locale,
  });

  if (error) {
    console.error("Error while retrieving content translations", error);
  }

  const contextValue = {
    dictionary: data?.data || [],
    locale,
    shouldLocalize: true,
  };

  useEffect(() => {
    if (!isLoading) {
      const dictionaryForLocale = Object.fromEntries(
        data?.data
          .filter((item) => item.locale === locale)
          .map((item) => [item.msgid, item.msgstr]) || [],
      );

      // Make the content translation dictionary available to Metabase Lib
      Lib.setContentTranslations(dictionaryForLocale);
    }
  }, [isLoading, data?.data, locale]);

  return (
    <ContentTranslationContext.Provider value={contextValue}>
      {children}
    </ContentTranslationContext.Provider>
  );
};

export type TCFunc = <TypeOfArgument>(msgid?: TypeOfArgument) => TypeOfArgument;

export const useTranslateContent = () => {
  const context = useContext(ContentTranslationContext);

  const tcFunc: TCFunc = <TypeOfArgument,>(msgid?: TypeOfArgument) =>
    (msgid && typeof msgid === "string"
      ? translateContentString(msgid, context)
      : msgid) as TypeOfArgument;

  return tcFunc;
};
