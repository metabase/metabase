import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type { LLMIndicatorProps } from "metabase/plugins/types";
import { getSubmittableQuestion } from "metabase/query_builder/selectors";
import { Button, Icon, Tooltip } from "metabase/ui";
import { AutoDescribeApi } from "metabase-enterprise/services";
import "./loading.css";
import type Question from "metabase-lib/v1/Question";

export const LLMSuggestQuestionInfo = ({
  question: initialQuestion,
  initialCollectionId,
  onAccept,
}: LLMIndicatorProps) => {
  const collectionId = canonicalCollectionId(initialCollectionId);
  const questionWithCollectionId: Question =
    initialQuestion.setCollectionId(collectionId);

  const question = useSelector(state =>
    getSubmittableQuestion(state, questionWithCollectionId),
  );

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
  const iconColor = loading ? color("text-medium") : "var(--mb-color-brand)";

  return (
    <Tooltip label={tooltip} position="top-end">
      <Button
        onClick={handleClick}
        className={className}
        leftSection={<Icon name="ai" color={iconColor} />}
        variant="subtle"
      />
    </Tooltip>
  );
};
