import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { POST } from "metabase/lib/api";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type { LLMIndicatorProps } from "metabase/plugins/types";
import { getSetting } from "metabase/selectors/settings";
import { Button, Icon, Tooltip } from "metabase/ui";

import "./loading.css";

const postSummarizeCard = POST("/api/ee/autodescribe/card/summarize");

export const LLMSuggestQuestionInfo = ({
  question,
  onAccept,
}: LLMIndicatorProps) => {
  const [acceptedSuggestion, setAcceptedSuggestion] = useState(false);

  const isActive = useSelector(
    state => !!getSetting(state, "ee-openai-api-key"),
  );

  const { loading, value } = useAsync(async () => {
    if (!isActive) {
      return { name: undefined, description: undefined };
    }
    const response = await postSummarizeCard(question.card());
    return {
      name: response?.summary?.title ?? undefined,
      description: response?.summary?.description ?? undefined,
    };
  }, [isActive]);

  const handleClick = () => {
    if (value) {
      setAcceptedSuggestion(true);
      onAccept(value);
    }
  };

  if (!isActive || acceptedSuggestion) {
    return null;
  }

  const tooltip = loading
    ? t`Generating descriptions`
    : t`Description generated. Click to auto-fill.`;

  const className = loading ? "llm-pulse-icon" : undefined;
  const iconColor = loading ? color("text-medium") : color("brand");

  return (
    <Tooltip label={tooltip} position="top-end">
      <Button
        onClick={handleClick}
        className={className}
        leftIcon={<Icon name="ai" color={iconColor} />}
        variant="subtle"
      />
    </Tooltip>
  );
};
