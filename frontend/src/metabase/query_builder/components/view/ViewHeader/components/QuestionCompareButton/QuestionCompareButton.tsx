import { useMemo } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Button, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { getCompareInput, useCompareState } from "../../../CompareSheet";
import { useSummaryDefinition } from "../../../SummarySheet/summary-store";
import { getSummaryKey } from "../../../SummarySheet/utils";
import ViewTitleHeaderS from "../../ViewTitleHeader.module.css";

type QuestionCompareButtonProps = {
  question: Question;
  isShowingCompare: boolean;
  /** Receives the button's position, so the compare sheet can grow out of it. */
  onToggleCompare: (origin: DOMRect) => void;
};

/**
 * Toggles the compare sheet for the summary's metrics, or the table's first metric without a
 * summary. While it's open, also links to the same comparison on the Explore page.
 */
export function QuestionCompareButton({
  question,
  isShowingCompare,
  onToggleCompare,
}: QuestionCompareButtonProps) {
  const summaryKey = getSummaryKey(question);
  const summaryDefinition = useSummaryDefinition(summaryKey);
  const compareState = useCompareState(summaryKey);
  const hasMetrics = useMemo(
    () => getCompareInput(question, summaryDefinition).metricIds.length > 0,
    [question, summaryDefinition],
  );

  return (
    <>
      <Tooltip
        label={
          hasMetrics
            ? t`See this next to other metrics`
            : t`Add a metric to the summary to compare it`
        }
      >
        <Button
          data-testid="compare-button"
          variant={isShowingCompare ? "filled" : "default"}
          disabled={!hasMetrics}
          leftSection={<Icon name="compare" />}
          classNames={{
            root: ViewTitleHeaderS.ActionButtonRoot,
            label: ViewTitleHeaderS.ActionButtonLabel,
            section: ViewTitleHeaderS.ActionButtonSection,
          }}
          onClick={(event) =>
            onToggleCompare(event.currentTarget.getBoundingClientRect())
          }
        >
          {t`Compare`}
        </Button>
      </Tooltip>
      {isShowingCompare && compareState && (
        <Tooltip label={t`Open in Explore`}>
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.metricsViewer(compareState.hash)}
            variant="subtle"
            size="lg"
            aria-label={t`Open in Explore`}
          >
            <Icon name="share" />
          </ActionIcon>
        </Tooltip>
      )}
    </>
  );
}
