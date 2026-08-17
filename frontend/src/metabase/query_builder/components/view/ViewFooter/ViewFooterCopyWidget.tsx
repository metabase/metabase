import { useMemo, useState } from "react";
import { t } from "ttag";

import { canDownloadResults } from "metabase/common/utils/dataset";
import { getFirstQueryResult } from "metabase/query_builder/selectors";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import {
  getCopyIneligibleReason,
  getCopyMode,
  useCopyResults,
} from "./use-copy-results";
import { useRenderedQuestion } from "./use-rendered-question";

export const ViewFooterCopyWidget = () => {
  const { question, isPivotResult, staleReason } = useRenderedQuestion();
  const result = useSelector(getFirstQueryResult);

  return (
    question &&
    result && (
      <CopyResultsButton
        question={question}
        result={result}
        isPivotResult={isPivotResult}
        staleReason={staleReason}
      />
    )
  );
};

interface CopyResultsButtonProps {
  question: Question;
  result: Dataset;
  isPivotResult: boolean;
  staleReason: string | null;
}

const CopyResultsButton = ({
  question,
  result,
  isPivotResult,
  staleReason,
}: CopyResultsButtonProps) => {
  const [copying, setCopying] = useState(false);
  const pivotedCopyEnabled = useSetting("enable-pivoted-exports") ?? true;
  const ineligibleReason = useMemo(
    () =>
      staleReason ??
      getCopyIneligibleReason(
        question,
        result,
        isPivotResult,
        pivotedCopyEnabled,
      ),
    [staleReason, question, result, isPivotResult, pivotedCopyEnabled],
  );
  const copyResults = useCopyResults({
    question,
    result,
    isPivotResult,
    pivotedCopyEnabled,
    ineligibleReason,
  });

  const label =
    getCopyMode(question) === "results"
      ? t`Copy these results to clipboard`
      : t`Copy this chart to clipboard`;

  const handleCopy = async () => {
    setCopying(true);

    try {
      await copyResults();
    } finally {
      setCopying(false);
    }
  };

  // Not the native disabled attribute: that swallows pointer events, and the
  // tooltip carrying the reason must keep showing
  const isDisabled = ineligibleReason != null;

  return (
    <Flex visibleFrom="sm">
      <Tooltip label={ineligibleReason ?? label}>
        <ActionIcon
          data-testid="question-results-copy-button"
          onClick={handleCopy}
          aria-label={label}
          loading={copying}
          aria-disabled={isDisabled || undefined}
          data-disabled={isDisabled || undefined}
          variant="viewFooter"
        >
          <Icon name="clipboard" />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );
};

ViewFooterCopyWidget.shouldRender = ({ result }: { result?: Dataset | null }) =>
  result != null && canDownloadResults(result);
