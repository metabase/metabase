import { useState } from "react";
import { t } from "ttag";

import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { ActionIcon, Flex, Icon, Popover, Tooltip } from "metabase/ui";
import type { Dataset } from "metabase-types/api";

import { QuestionDownloadWidget } from "../QuestionDownloadWidget";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "../QuestionDownloadWidget/use-download-data";

export type QuestionDownloadPopoverProps = {
  className?: string;
} & Pick<UseDownloadDataParams, "question" | "result"> &
  Partial<Omit<UseDownloadDataParams, "question" | "result">>;

const QuestionDownloadPopover = ({
  className,
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  visualizationSettings,
}: QuestionDownloadPopoverProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId,
    dashcardId,
    uuid,
    token,
    visualizationSettings,
  });

  return (
    <Popover opened={isPopoverOpen} onChange={setIsPopoverOpen}>
      <Popover.Target>
        <Flex className={className}>
          <Tooltip label={t`Download results`} disabled={isPopoverOpen}>
            <ActionIcon
              c="var(--mb-color-text-primary)"
              data-testid="question-results-download-button"
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            >
              <Icon name="download" />
            </ActionIcon>
          </Tooltip>
        </Flex>
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

interface ShouldRenderDownloadPopoverProps {
  result?: Dataset;
}

QuestionDownloadPopover.shouldRender = ({
  result,
}: ShouldRenderDownloadPopoverProps) => {
  return (
    result &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionDownloadPopover;
