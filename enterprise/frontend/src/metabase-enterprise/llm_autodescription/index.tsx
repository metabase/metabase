import { useCallback, useMemo } from "react";

import { useAsync } from "react-use";
import * as Lib from "metabase-lib";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";
import { Group } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import type { State } from "metabase-types/store";
import { GET, POST } from "metabase/lib/api";
import type { TUseLLMQuestionNameDescription } from "metabase/plugins/types";
import type Question from "metabase-lib/Question";

const API = {
  summarizeCard: POST("/api/ee/autodescribe/card/summarize"),
  summarizeDashboard: GET(
    "/api/ee/autodescribe/dashboard/summarize/:dashboardId",
  ),
};

const apiGetCardSummary = async (question: Question, state: State) => {
  // Needed for persisting visualization columns for pulses/alerts, see #6749
  const series = getTransformedSeries(state);
  const questionWithVizSettings = series
    ? getQuestionWithDefaultVisualizationSettings(question, series)
    : question;

  const resultsMetadata = getResultsMetadata(state);
  const isResultDirty = getIsResultDirty(state);
  const cleanQuery = Lib.dropStageIfEmpty(question.query(), -1);
  const newQuestion = questionWithVizSettings
    .setQuery(cleanQuery)
    .setResultsMetadata(isResultDirty ? null : resultsMetadata);

  const response = await API.summarizeCard(newQuestion.card());

  return response;
};

function LoadingIndicator() {
  return (
    <Group position="right">
      <div>
        <span className="suggestionLoading3">✨</span>
        <span className="suggestionLoading2">✨</span>
        <span className="suggestionLoading">✨</span>
        Generating question title and description
        <span className="suggestionLoading"> ✨</span>
        <span className="suggestionLoading2">✨</span>
        <span className="suggestionLoading3">✨</span>
      </div>
    </Group>
  );
}

const useLLMQuestionNameDescription: TUseLLMQuestionNameDescription = ({
  initialValues,
  question,
}) => {
  const state = useSelector(state => state);

  const suggestCardInfo = useCallback(async () => {
    const collectionId = canonicalCollectionId(initialValues.collection_id);
    const displayName = initialValues.name.trim();
    const description = initialValues.description
      ? initialValues.description.trim()
      : null;

    const newQuestion = question
      .setDisplayName(displayName)
      .setDescription(description)
      .setCollectionId(collectionId);

    return await apiGetCardSummary(newQuestion, state);
  }, [initialValues, question, state]);
  // TODO: Would be nice if we could control the saveType state
  // * in this component and only call useAsync function if you
  // * are in the `create` save type
  const { loading, value } = useAsync(suggestCardInfo, []);
  const { name, description } = useMemo(() => {
    if (value?.summary) {
      return {
        name: value?.summary?.title,
        description: value?.summary?.description,
      };
    }

    return {};
  }, [value]);

  return {
    name,
    description,
    loading,
    LLMLoadingIndicator: loading ? LoadingIndicator : () => null,
  };
};

// TODO remove `true` once token is up
if (true || hasPremiumFeature("llm_autodescription")) {
  PLUGIN_LLM_AUTODESCRIPTION.useLLMQuestionNameDescription =
    useLLMQuestionNameDescription;
}
