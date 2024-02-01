import { useAsync } from "react-use";

import * as Lib from "metabase-lib";
import { useSelector } from "metabase/lib/redux";
import { Group } from "metabase/ui";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import { POST } from "metabase/lib/api";
import type { TUseLLMQuestionNameDescription } from "metabase/plugins/types";

import "./use-llm-question-name-description.css";
import { getSetting } from "metabase/selectors/settings";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

export const useLLMQuestionNameDescription: TUseLLMQuestionNameDescription = ({
  initialValues,
  question,
}) => {
  const state = useSelector(state => state);

  const { loading, value: result } = useAsync(async () => {
    // only generate a name and description if the user is creating a new question
    if (
      !getSetting(state, "ee-openai-api-key") ||
      initialValues.saveType !== "create"
    ) {
      return {
        generatedName: undefined,
        generatedDescription: undefined,
      };
    }

    const collectionId = canonicalCollectionId(initialValues.collection_id);
    const questionWithCollectionId = question.setCollectionId(collectionId);

    let questionWithVizSettings = questionWithCollectionId;
    const series = getTransformedSeries(state);
    if (series) {
      questionWithVizSettings = getQuestionWithDefaultVisualizationSettings(
        questionWithCollectionId,
        series,
      );
    }

    const resultsMetadata = getResultsMetadata(state);
    const isResultDirty = getIsResultDirty(state);
    const cleanQuery = Lib.dropStageIfEmpty(
      questionWithVizSettings.query(),
      -1,
    );
    questionWithVizSettings
      .setQuery(cleanQuery)
      .setResultsMetadata(isResultDirty ? null : resultsMetadata);

    const response = await postSummarizeCard(questionWithVizSettings.card());

    return {
      generatedName: response?.summary?.title,
      generatedDescription: response?.summary?.description,
    };
  });

  return {
    generatedName: result?.generatedName ?? "",
    generatedDescription: result?.generatedDescription ?? "",
    loading,
    LLMLoadingIndicator: () => {
      if (!loading) {
        return null;
      }
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
    },
  };
};
