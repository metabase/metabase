import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useStore } from "metabase/lib/redux";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId, DashboardId, Dataset } from "metabase-types/api";

type DashCardQuestionDownloadButtonProps = {
  question: Question;
  result: Dataset;
  dashboardId: DashboardId;
  dashcardId: DashCardId;
  uuid?: string;
  token?: string;
};

export const DashCardQuestionDownloadButton = ({
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
}: DashCardQuestionDownloadButtonProps) => {
  const store = useStore();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId,
    dashcardId,
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
          onDownload={(opts) => {
            setIsPopoverOpen(false);
            handleDownload(opts);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
