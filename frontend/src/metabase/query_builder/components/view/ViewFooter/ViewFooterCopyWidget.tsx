import { useMemo } from "react";
import { t } from "ttag";

import { canDownloadResults } from "metabase/common/utils/dataset";
import {
  getCopyIneligibleReason,
  getCopyMode,
  useCopyResults,
} from "metabase/querying/common/hooks/use-copy-results";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { getFirstQueryResult } from "../../../store/selectors";

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
  });

  const label =
    getCopyMode(question) === "results"
      ? t`Copy these results to clipboard`
      : t`Copy this chart to clipboard`;

  return (
    <Flex visibleFrom="sm">
      <Tooltip label={ineligibleReason ?? label}>
        <ActionIcon
          variant="subtle"
          data-testid="question-results-copy-button"
          onClick={copyResults}
          aria-label={label}
          disabled={ineligibleReason !== null}
        >
          <Icon name="clipboard" />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );
};

ViewFooterCopyWidget.shouldRender = ({ result }: { result?: Dataset | null }) =>
  result != null && canDownloadResults(result);
