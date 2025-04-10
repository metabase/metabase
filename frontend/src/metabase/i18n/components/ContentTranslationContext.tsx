import { type ReactNode, createContext, useContext } from "react";

import { useListContentTranslationsQuery } from "metabase/api/content-translation";
import { useLocale } from "metabase/common/hooks";

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

  const { data, error } = useListContentTranslationsQuery({
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
