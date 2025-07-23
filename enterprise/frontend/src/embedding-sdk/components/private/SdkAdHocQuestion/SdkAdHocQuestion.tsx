import { useMemo } from "react";

import type { SdkQuestionProps } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import { SdkQuestion } from "embedding-sdk/components/public/SdkQuestion/SdkQuestion";
import * as Urls from "metabase/lib/urls";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import type { QuestionMockLocationParameters } from "../SdkQuestion/context";

interface SdkAdHocQuestionProps {
  questionPath: string; // route path to load a question, e.g. /question/140-best-selling-products - for saved, or /question/xxxxxxx for ad-hoc encoded question config
  onNavigateBack: () => void;
}

export const SdkAdHocQuestion = ({
  questionPath,
  withResetButton = true,
  title,
  plugins,
  height,
  width,
  className,
  style,
  children = null,
  onBeforeSave,
  onSave,
  entityTypes,
  isSaveEnabled,
  targetCollection,
  withChartTypeSelector = true,
  withDownloads = false,
  initialSqlParameters,
  onNavigateBack,
}: SdkAdHocQuestionProps &
  Pick<
    SdkQuestionProps,
    | "withResetButton"
    | "title"
    | "plugins"
    | "height"
    | "width"
    | "className"
    | "style"
    | "children"
    | "onBeforeSave"
    | "onSave"
    | "entityTypes"
    | "isSaveEnabled"
    | "targetCollection"
    | "withChartTypeSelector"
    | "withDownloads"
    | "initialSqlParameters"
  >) => {
  const { location, params } = useMemo(
    () => getQuestionParameters(questionPath),
    [questionPath],
  );

  // If we cannot extract an entity ID from the slug, assume we are creating a new question.
  const questionId = Urls.extractEntityId(params.slug) ?? null;

  const { options, deserializedCard } = useMemo(() => {
    const { options, serializedCard } = parseHash(location.hash);
    const deserializedCard = serializedCard && deserializeCard(serializedCard);

    return { options, deserializedCard };
  }, [location.hash]);

  return (
    <SdkQuestion
      questionId={questionId}
      options={options}
      deserializedCard={deserializedCard}
      componentPlugins={plugins}
      onBeforeSave={onBeforeSave}
      onSave={onSave}
      entityTypes={entityTypes}
      isSaveEnabled={isSaveEnabled}
      targetCollection={targetCollection}
      initialSqlParameters={initialSqlParameters}
      withDownloads={withDownloads}
      onNavigateBack={onNavigateBack}
      height={height}
      width={width}
      className={className}
      style={style}
      title={title}
      withResetButton={withResetButton}
      withChartTypeSelector={withChartTypeSelector}
    >
      {children}
    </SdkQuestion>
  );
};

/**
 * This generates route parameters based on the provided URL path
 * to load the interactive questions. See [use-load-question.ts]
 */
export const getQuestionParameters = (
  questionPath: string,
): QuestionMockLocationParameters => {
  const url = new URL(questionPath, "http://metabase.com"); // we use a dummy host name to fill-in full URL
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
