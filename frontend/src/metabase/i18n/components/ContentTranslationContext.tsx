import { type ReactNode, createContext, useContext } from "react";

import { useListContentTranslationsQuery } from "metabase/api/content-translation";
import { useLocale } from "metabase/common/hooks";

import type { ContentTranslationContextObject } from "../types";
import { translateProperty, translateString } from "../utils";

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
  console.log("@m91rnpfs", "locale", locale);

  const {
    data,
    error,
    // TODO: the loading state is not represented
    isLoading: _isLoading,
  } = useListContentTranslationsQuery({
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

export const useTranslateContent = () => {
  const context = useContext(ContentTranslationContext);
  return getContentTranslationFunction(context);
};

export type TCFunc = <TypeOfArgument>(msgid?: TypeOfArgument) => TypeOfArgument;

export const useTranslateContent2 = () => {
  const context = useContext(ContentTranslationContext);

  // FIXME: Useful in development but let's remove this later
  if (!context.dictionary?.length) {
    console.log("Dictionary is empty");
  }

  const tcFunc: TCFunc = <TypeOfArgument,>(msgid?: TypeOfArgument) =>
    (msgid && typeof msgid === "string"
      ? translateString(msgid, context)
      : msgid) as TypeOfArgument;

  return tcFunc;
};

export const getContentTranslationFunction = (
  context: ContentTranslationContextObject,
) => {
  return (obj: any, property: string) =>
    translateProperty(obj, property, (msgid: string) =>
      translateString(msgid, context),
    );
};
