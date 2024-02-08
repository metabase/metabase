import { useAsync } from "react-use";

import type { TUseLLMIndicator } from "metabase/plugins/types";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Indicator, Tooltip } from "@mantine/core";
import { POST } from "metabase/lib/api";

import "./loading.css";
import { canonicalCollectionId } from "metabase/collections/utils";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import * as Lib from "metabase-lib";
import { useState } from "react";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

export const useLLMIndicator: TUseLLMIndicator = ({
  initialValues,
  question,
  defaultWrapper = null,
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

  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
  };

  const generatedName =
    clicked && result?.generatedName ? result.generatedName : "";
  const generatedDescription =
    clicked && result?.generatedDescription ? result.generatedDescription : "";

  return {
    generatedName: generatedName,
    generatedDescription: generatedDescription,
    loading,
    LLMLoadingBadge: ({ children }) => {
      if (loading) {
        return (
          <span>
            <Tooltip label="Descriptions being generated." position="top-end">
              <Indicator
                processing
                size={16}
                color="#0000f0"
                label="AI" />
            </Tooltip>
            {children}
          </span>
        );
      } else if (clicked) {
        return <>{children}</>;
      } else {
        return (
          <span>
            <Tooltip label="Description generated. Click to auto-fill."
              position="top-end">
              <Indicator
                onClick={handleClick}
                size={24}
                color="#0000f0"
                style={{ verticalAlign: "middle", cursor: "pointer" }}
                label="💡" />
            </Tooltip>
            {children}
          </span>
        );
      }
    },
  };
};
