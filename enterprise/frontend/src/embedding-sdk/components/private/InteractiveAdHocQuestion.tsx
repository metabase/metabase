import { useMemo } from "react";

import type { BaseInteractiveQuestionProps } from "embedding-sdk/components/public/InteractiveQuestion";
import * as Urls from "metabase/lib/urls";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

import {
  InteractiveQuestionProvider,
  type QuestionMockLocationParameters,
} from "./InteractiveQuestion/context";
import {
  InteractiveQuestionDefaultView,
  type InteractiveQuestionDefaultViewProps,
} from "./InteractiveQuestionDefaultView";

interface InteractiveAdHocQuestionProps {
  questionPath: string; // route path to load a question, e.g. /question/140-best-selling-products - for saved, or /question/xxxxxxx for ad-hoc encoded question config
  onNavigateBack: () => void;
}

export const InteractiveAdHocQuestion = ({
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
  entityTypeFilter,
  isSaveEnabled,
  targetCollection,
  withChartTypeSelector = true,
  withDownloads = false,
  initialSqlParameters,
  onNavigateBack,
}: InteractiveAdHocQuestionProps &
  Omit<BaseInteractiveQuestionProps, "questionId"> &
  InteractiveQuestionDefaultViewProps) => {
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
    <InteractiveQuestionProvider
      questionId={questionId}
      options={options}
      deserializedCard={deserializedCard}
      componentPlugins={plugins}
      onBeforeSave={onBeforeSave}
      onSave={onSave}
      entityTypeFilter={entityTypeFilter}
      isSaveEnabled={isSaveEnabled}
      targetCollection={targetCollection}
      initialSqlParameters={initialSqlParameters}
      withDownloads={withDownloads}
      onNavigateBack={onNavigateBack}
    >
      {children ?? (
        <InteractiveQuestionDefaultView
          height={height}
          width={width}
          className={className}
          style={style}
          title={title}
          withResetButton={withResetButton}
          withChartTypeSelector={withChartTypeSelector}
        />
      )}
    </InteractiveQuestionProvider>
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
