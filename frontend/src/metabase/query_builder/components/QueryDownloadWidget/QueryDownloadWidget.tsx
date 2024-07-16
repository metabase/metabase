import { useState } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Flex, Popover, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

import { QueryDownloadPopover } from "../QueryDownloadPopover";
import { useDownloadData } from "../QueryDownloadPopover/use-download-data";

import { DownloadIcon } from "./QueryDownloadWidget.styled";

interface QueryDownloadWidgetProps {
  className?: string;
  question: Question;
  result: Dataset;
  uuid?: string;
  token?: string;
  visualizationSettings?: VisualizationSettings;
  dashcardId?: DashCardId;
  dashboardId?: DashboardId;
}

const QueryDownloadWidget = ({
  className,
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  visualizationSettings,
}: QueryDownloadWidgetProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [{ loading }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId,
    dashcardId,
    uuid,
    token,
    visualizationSettings,
  });

  return (
    <Popover opened={isPopoverOpen} onClose={() => setIsPopoverOpen(false)}>
      <Popover.Target>
        <Flex className={className}>
          {loading ? (
            <Tooltip label={t`Downloading…`}>
              <LoadingSpinner size={18} />
            </Tooltip>
          ) : (
            <Tooltip label={t`Download full results`}>
              <DownloadIcon
                onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                name="download"
                size={20}
                data-testid="download-button"
              />
            </Tooltip>
          )}
        </Flex>
      </Popover.Target>
      <Popover.Dropdown p="0.75rem">
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={opts => {
            setIsPopoverOpen(false);
            handleDownload(opts);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

interface QueryDownloadWidgetOpts {
  result?: Dataset;
}

QueryDownloadWidget.shouldRender = ({ result }: QueryDownloadWidgetOpts) => {
  return (
    result &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QueryDownloadWidget;
