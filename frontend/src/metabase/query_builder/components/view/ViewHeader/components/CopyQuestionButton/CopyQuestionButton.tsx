import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

interface CopyQuestionButtonProps {
  question: Question;
}

export const CopyQuestionButton = ({
  question,
}: CopyQuestionButtonProps): React.JSX.Element => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const datasetQuery = question.card().dataset_query;
      const queryString = JSON.stringify(datasetQuery, null, 2);

      await navigator.clipboard.writeText(queryString);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy question:", error);
    }
  }, [question]);

  return (
    <Tooltip
      label={
        <span style={{ fontWeight: 700, color: "white" }}>{t`Copied!`}</span>
      }
      opened={copied}
    >
      <Button
        className={ViewTitleHeaderS.ToggleNativeQueryButton}
        leftSection={<Icon name="copy" />}
        onClick={handleCopy}
        aria-label={t`Copy Question`}
      >
        {t`Copy Question`}
      </Button>
    </Tooltip>
  );
};

CopyQuestionButton.shouldRender = ({
  question,
  queryBuilderMode,
}: {
  question: Question;
  queryBuilderMode: string;
}) => {
  // Only show in query editor and notebook modes, not in visualization view
  if (
    queryBuilderMode !== "query" &&
    queryBuilderMode !== "native" &&
    queryBuilderMode !== "notebook"
  ) {
    return false;
  }

  // Only show if question has a valid dataset_query
  const datasetQuery = question.card().dataset_query;
  return datasetQuery && typeof datasetQuery === "object";
};
