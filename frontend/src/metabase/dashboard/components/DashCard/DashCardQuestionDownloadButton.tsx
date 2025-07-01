import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDashboardContext } from "metabase/dashboard/context";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Popover, Tooltip } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/v1/Question";
import type { DashboardCard, Dataset } from "metabase-types/api";

import { getDashcardTokenId, getDashcardUuid } from "./dashcard-ids";

type DashCardQuestionDownloadButtonProps = {
  result: Dataset;
  dashcard: DashboardCard;
};

export const DashCardQuestionDownloadButton = ({
  result,
  dashcard,
}: DashCardQuestionDownloadButtonProps) => {
  const store = useStore();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const token = getDashcardTokenId(dashcard);
  const uuid = getDashcardUuid(dashcard);
  const { dashboardId } = useDashboardContext();

  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(dashcard.card, metadata),
    [dashcard.card, metadata],
  );

  // by the time we reach this code,  dashboardId really should not be null.
  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question: question,
    result,
    dashboardId: checkNotNull(dashboardId),
    dashcardId: dashcard.id,
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
