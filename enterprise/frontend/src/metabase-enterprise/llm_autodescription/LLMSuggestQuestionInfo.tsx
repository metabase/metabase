import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { POST } from "metabase/lib/api";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type { TLLMIndicatorProps } from "metabase/plugins/types";
import { getQuestionWithDefaultVisualizationSettings } from "metabase/query_builder/actions/core/utils";
import {
  getIsResultDirty,
  getResultsMetadata,
  getTransformedSeries,
} from "metabase/query_builder/selectors";
import { getSetting } from "metabase/selectors/settings";
import { Flex, Tooltip, Icon, Button } from "metabase/ui";
import "./loading.css";
import * as Lib from "metabase-lib";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

type TSummarizeCardResponse = () => Promise<{
  name?: string;
  description?: string;
}>;

export const LLMSuggestQuestionInfo = ({
  question,
  onAccept,
}: TLLMIndicatorProps) => {
  const state = useSelector(state => state);
  const inactive = !getSetting(state, "ee-openai-api-key");

  const { loading, value } = useAsync<TSummarizeCardResponse>(async () => {
    if (inactive) {
      return { name: undefined, description: undefined };
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
    const cleanQuery = Lib.dropEmptyStages(questionWithVizSettings.query());
    questionWithVizSettings
      .setQuery(cleanQuery)
      .setResultsMetadata(isResultDirty ? null : resultsMetadata);

    const response = await postSummarizeCard(questionWithVizSettings.card());

    return {
      name: response?.summary?.title ?? undefined,
      description: response?.summary?.description ?? undefined,
    };
  }, [question]);

  const [acceptedSuggestion, setAcceptedSuggestion] = useState(false);

  const handleClick = () => {
    if (value) {
      setAcceptedSuggestion(true);
      onAccept(value);
    }
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
