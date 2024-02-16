import { useAsync } from "react-use";

import { useState } from "react";
import type {
  TLLMIndicatorProps,
  TUseLLMIndicator,
} from "metabase/plugins/types";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Tooltip, Icon } from "metabase/ui";
import { POST } from "metabase/lib/api";

import "./loading.css";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import * as Lib from "metabase-lib";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

export const useLLMIndicator: TUseLLMIndicator = ({ question }) => {
  const state = useSelector(state => state);

  const inactive = !getSetting(state, "ee-openai-api-key");

  const { loading, value: result } = useAsync(async () => {
    if (inactive) {
      return {
        generatedName: undefined,
        generatedDescription: undefined,
      };
    }

    let questionWithVizSettings = question;
    const series = getTransformedSeries(state);
    if (series) {
      questionWithVizSettings = getQuestionWithDefaultVisualizationSettings(
        question,
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

  return {
    LLMIndicator: ({ setFieldValue, validateForm }: TLLMIndicatorProps) => {
      const handleClick = () => {
        setClicked(true);

        const generatedName = result?.generatedName ? result.generatedName : "";
        const generatedDescription = result?.generatedDescription
          ? result.generatedDescription
          : "";

        setFieldValue("name", generatedName);
        setFieldValue("description", generatedDescription);
        validateForm({ name: true, description: true });
      };

      if (inactive || clicked) {
        return <></>;
      } else if (loading) {
        return (
          <Flex justify="flex-end">
            <Tooltip label="Descriptions being generated." position="top-end">
              <Icon name="star" className="pulseicon" size={24} />
            </Tooltip>
          </Flex>
        );
      } else {
        return (
          <Flex justify="flex-end">
            <Tooltip
              label="Description generated. Click to auto-fill."
              position="top-end"
            >
              <Icon
                name="star_filled"
                className="text-brand"
                // color="#ffff00"
                // stroke="#000000"
                onClick={handleClick}
                style={{ verticalAlign: "middle", cursor: "pointer" }}
                size={24}
              />
            </Tooltip>
          </Flex>
        );
      }
    },
  };
};
