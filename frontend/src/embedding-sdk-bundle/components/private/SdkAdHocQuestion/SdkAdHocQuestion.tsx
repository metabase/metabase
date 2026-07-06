import { useMemo } from "react";

import type { SdkQuestionProps } from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import { deserializeCard, parseHash } from "metabase/common/utils/card";
import * as Urls from "metabase/urls";

import type { QuestionMockLocationParameters } from "../SdkQuestion/context";

interface SdkAdHocQuestionProps {
  questionPath: string; // route path to load a question, e.g. /question/140-best-selling-products - for saved, or /question/xxxxxxx for ad-hoc encoded question config
  onNavigateBack?: () => void;
}

export const SdkAdHocQuestion = ({
  questionPath,
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
  dataPicker,
  isSaveEnabled,
  targetCollection,
  withChartTypeSelector = true,
  withDownloads = false,
  initialSqlParameters,
  onNavigateBack,
  onVisualizationChange,
  navigateToNewCard,
}: SdkAdHocQuestionProps &
  Pick<
    SdkQuestionProps,
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
    | "dataPicker"
    | "isSaveEnabled"
    | "targetCollection"
    | "withChartTypeSelector"
    | "withDownloads"
    | "initialSqlParameters"
    | "onVisualizationChange"
    | "navigateToNewCard"
  >) => {
  const { location, params } = useMemo(
    () => getQuestionParameters(questionPath),
    [questionPath],
  );

  const { options, deserializedCard } = useMemo(() => {
    const { options, serializedCard } = parseHash(location.hash);
    const deserializedCard = serializedCard
      ? deserializeCard(serializedCard)
      : undefined;

    return { options, deserializedCard };
  }, [location.hash]);

  const questionId = resolveQuestionId(
    params.slug,
    deserializedCard as { dataset_query?: { type?: string } } | undefined,
  );

  return (
    <SdkQuestion
      questionId={questionId}
      options={options}
      deserializedCard={deserializedCard}
      plugins={plugins}
      onBeforeSave={onBeforeSave}
      onSave={onSave}
      entityTypes={entityTypes}
      dataPicker={dataPicker}
      isSaveEnabled={isSaveEnabled}
      targetCollection={targetCollection}
      initialSqlParameters={initialSqlParameters}
      withDownloads={withDownloads}
      onNavigateBack={onNavigateBack}
      navigateToNewCard={navigateToNewCard}
      height={height}
      width={width}
      className={className}
      style={style}
      title={title}
      withChartTypeSelector={withChartTypeSelector}
      onVisualizationChange={onVisualizationChange}
    >
      {children}
    </SdkQuestion>
  );
};

/**
 * Derives the questionId from URL slug and deserialized card.
 * Returns "new-native" for hash-encoded native cards (e.g. Metabot SQL editor navigation),
 * a numeric/string ID for saved questions, or null for new notebook questions.
 */
export function resolveQuestionId(
  slug: string | undefined,
  deserializedCard: { dataset_query?: { type?: string } } | undefined,
): SdkQuestionId | null {
  const extractedId = Urls.extractEntityId(slug) ?? null;
  if (extractedId !== null) {
    return extractedId;
  }
  if (deserializedCard?.dataset_query?.type === "native") {
    return "new-native";
  }
  return null;
}

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
