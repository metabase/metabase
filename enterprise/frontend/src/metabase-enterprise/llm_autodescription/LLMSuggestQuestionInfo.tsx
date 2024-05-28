import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { color } from "metabase/lib/colors";
import type { LLMIndicatorProps } from "metabase/plugins/types";
import { Button, Icon, Tooltip } from "metabase/ui";
import { AutoDescribeApi } from "metabase-enterprise/services";

import "./loading.css";

export const LLMSuggestQuestionInfo = ({
  question,
  onAccept,
}: LLMIndicatorProps) => {
  const [acceptedSuggestion, setAcceptedSuggestion] = useState(false);

  const isActive = useSetting("ee-ai-features-enabled");

  const { loading, value } = useAsync(async () => {
    if (!isActive) {
      return { name: undefined, description: undefined };
    }
    const response = await AutoDescribeApi.summarizeCard(question.card());
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
