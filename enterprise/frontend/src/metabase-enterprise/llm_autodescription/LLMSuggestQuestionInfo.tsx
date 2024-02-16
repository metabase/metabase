import { useAsync } from "react-use";
import { t } from "ttag";
import { useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Tooltip, Icon, Button } from "metabase/ui";
import { POST } from "metabase/lib/api";
import { color } from "metabase/lib/colors";

import "./loading.css";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import * as Lib from "metabase-lib";
import type { TLLMIndicatorProps } from "metabase/plugins/types";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

type TSummarizeCardResponse = () => Promise<{
  generatedName?: string;
  generatedDescription?: string;
}>;

export const LLMSuggestQuestionInfo = ({
  question,
  setFieldValue,
  validateForm,
}: TLLMIndicatorProps) => {
  const state = useSelector(state => state);
  const inactive = !getSetting(state, "ee-openai-api-key");

  const { loading, value } = useAsync<TSummarizeCardResponse>(async () => {
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
      generatedName: response?.summary?.title ?? undefined,
      generatedDescription: response?.summary?.description ?? undefined,
    };
  }, [question]);

  const generatedName = value?.generatedName;
  const generatedDescription = value?.generatedDescription;

  const [acceptedSuggestion, setAcceptedSuggestion] = useState(false);

  const handleClick = () => {
    setAcceptedSuggestion(true);

    setFieldValue("name", generatedName ?? "");
    setFieldValue("description", generatedDescription ?? "");
    validateForm({ name: true, description: true });
  };

  if (inactive || acceptedSuggestion) {
    return null;
  }

  if (loading) {
    return (
      <Flex justify="flex-end">
        <Tooltip
          label={t`Generating descriptions`}
          className="llm-pulse-icon"
          position="top-end"
        >
          <Button variant="unstyled" p="xs">
            <Icon name="ai" size={16} />
          </Button>
        </Tooltip>
      </Flex>
    );
  }

  return (
    <Flex justify="flex-end">
      <Tooltip
        label={t`Description generated. Click to auto-fill.`}
        position="top-end"
      >
        <Button onClick={handleClick} variant="unstyled" p="xs">
          <Icon name="ai" color={color("brand")} size={16} />
        </Button>
      </Tooltip>
    </Flex>
  );
};
