import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDashcardMenuState } from "metabase/dashboard/hooks/use-dashcard-menu-state";
import { getDashcardData } from "metabase/dashboard/selectors";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/v1/Question";
import type { Dashboard, DashboardCard } from "metabase-types/api";

import { useDashCardSeries } from "./DashCard";
import { getSeriesForDashcard } from "./DashCardVisualization";

type DashCardQuestionDownloadButtonProps = {
  dashboard: Dashboard;
  dashcard: DashboardCard;
};

export const DashCardQuestionDownloadButtonInner = ({
  dashboard,
  dashcard,
  question,
}: DashCardQuestionDownloadButtonProps & { question: Question }) => {
  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const { series: untranslatedRawSeries } = useDashCardSeries(dashcard);

  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  const { series } = useMemo(
    () => getSeriesForDashcard({ rawSeries, dashcard, datasets }),
    [rawSeries, dashcard, datasets],
  );

  const {
    formatPreference,
    setFormatPreference,
    isDownloadingData,
    handleDownload,
    result,
  } = useDashcardMenuState({ question, dashboard, dashcard, series });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <Popover
      opened={isPopoverOpen}
      onChange={setIsPopoverOpen}
      position="bottom-end"
    >
      <Popover.Target>
        <Tooltip label={t`Download results`}>
          <ActionIcon
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            className={cx(
              SAVING_DOM_IMAGE_HIDDEN_CLASS,
              CS.hoverChild,
              CS.hoverChildSmooth,
            )}
            loading={isDownloadingData}
            aria-label={t`Download results`}
          >
            <Icon name="download" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="0.75rem">
        <QuestionDownloadWidget
          question={question}
          result={result}
          formatPreference={formatPreference}
          setFormatPreference={setFormatPreference}
          onDownload={(opts) => {
            setIsPopoverOpen(false);
            handleDownload(opts);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export const DashCardQuestionDownloadButton = ({
  dashboard,
  dashcard,
}: DashCardQuestionDownloadButtonProps) => {
  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);

  if (!question) {
    return null;
  }

  return (
    <DashCardQuestionDownloadButtonInner
      dashboard={dashboard}
      dashcard={dashcard}
      question={question}
    />
  );
};
