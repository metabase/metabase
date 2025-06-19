import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import {
  getDashcardData,
  getParameterValuesBySlugMap,
} from "metabase/dashboard/selectors";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useUserKeyValue } from "metabase/hooks/use-user-key-value";
import { useSelector, useStore } from "metabase/lib/redux";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/v1/Question";
import type { Dashboard, DashboardCard } from "metabase-types/api";

import { useDashCardSeries } from "./DashCard";
import { getSeriesForDashcard } from "./DashCardVisualization";

type DashCardQuestionDownloadButtonProps = {
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
};

export const DashCardQuestionDownloadButton = ({
  dashboard,
  dashcard,
}: DashCardQuestionDownloadButtonProps) => {
  const store = useStore();

  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);
  const { series: untranslatedRawSeries } = useDashCardSeries(dashcard);

  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  const { series } = useMemo(
    () => getSeriesForDashcard({ rawSeries, dashcard, datasets }),
    [rawSeries, dashcard, datasets],
  );

  const result = series[0];

  const token = useMemo(
    () =>
      isJWT(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined,
    [dashcard],
  );
  const uuid = useMemo(
    () =>
      isUuid(dashcard.dashboard_id) ? String(dashcard.dashboard_id) : undefined,
    [dashcard],
  );

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const canDownloadPng = canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const { value: formatPreference, setValue: setFormatPreference } =
    useUserKeyValue({
      namespace: "last_download_format",
      key: "download_format_preference",
      defaultValue: {
        last_download_format: formats[0],
        last_table_download_format: exportFormats[0],
      },
    });

  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId: dashboard?.id,
    dashcardId: dashcard?.id,
    uuid,
    token,
    params: getParameterValuesBySlugMap(store.getState()),
  });

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
