import { useMemo } from "react";

import type { SdkClickActionPluginsConfig } from "embedding-sdk";

import { InteractiveQuestionProvider } from "../public/InteractiveQuestion/context";

import { InteractiveQuestionResult } from "./InteractiveQuestionResult";

interface InteractiveAdHocQuestionProps {
  questionPath: string; // route path to load a question, e.g. /question/140-best-selling-products - for saved, or /question/xxxxxxx for ad-hoc encoded question config
  onNavigateBack: () => void;

  withTitle?: boolean;
  height?: number;
  plugins?: SdkClickActionPluginsConfig;
}

export const InteractiveAdHocQuestion = ({
  questionPath,
  onNavigateBack,
  withTitle = true,
  height,
  plugins,
}: InteractiveAdHocQuestionProps) => {
  const { location, params } = useMemo(
    () => getQuestionParameters(questionPath),
    [questionPath],
  );

  return (
    <InteractiveQuestionProvider
      location={location}
      params={params}
      componentPlugins={plugins}
      onNavigateBack={onNavigateBack}
    >
      <InteractiveQuestionResult height={height} withTitle={withTitle} />
    </InteractiveQuestionProvider>
  );
};

// This generates route parameters based on provided URL path to use it QB (QueryBuilder) initialization logic, which loads question and all it needs. See "initializeQBRaw" redux action.
export const getQuestionParameters = (questionPath: string) => {
  const url = new URL(`http://metabase.com${questionPath}`); // we use a dummy host name to fill-in full URL
  const pathSections = questionPath.split("/").slice(1); // remove first empty section
  const entityId = pathSections.length > 1 ? pathSections[1] : null; // extract possible question id if it is a saved question URL

  return {
    location: {
      search: url.search,
      hash: url.hash,
      pathname: url.pathname,
    },
    params: entityId ? { slug: entityId } : {},
  };
};
