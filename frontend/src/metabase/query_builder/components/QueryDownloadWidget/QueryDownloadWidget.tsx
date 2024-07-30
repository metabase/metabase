import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type { DownloadQueryResultsOpts } from "metabase/redux/downloads";
import { downloadQueryResults } from "metabase/redux/downloads";
import { Flex, Popover, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset, VisualizationSettings } from "metabase-types/api";

import QueryDownloadPopover from "../QueryDownloadPopover";

import { DownloadIcon } from "./QueryDownloadWidget.styled";

interface OwnProps {
  className?: string;
  question: Question;
  result: Dataset;
  uuid?: string;
  token?: string;
  visualizationSettings?: VisualizationSettings;
  dashcardId?: number;
  dashboardId?: number;
}

interface DispatchProps {
  onDownload: (opts: DownloadQueryResultsOpts) => void;
}

type QueryDownloadWidgetProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onDownload: downloadQueryResults,
};

const QueryDownloadWidget = ({
  className,
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  visualizationSettings,
  onDownload,
}: QueryDownloadWidgetProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const handleDownload = useCallback(
    (opts: { type: string; enableFormatting: boolean }) => {
      onDownload({
        ...opts,
        question,
        result,
        dashboardId,
        dashcardId,
        uuid,
        token,
        visualizationSettings,
      });
    },
    [
      onDownload,
      question,
      result,
      dashboardId,
      dashcardId,
      uuid,
      token,
      visualizationSettings,
    ],
  );

  return (
    <Popover opened={isPopoverOpen} onClose={() => setIsPopoverOpen(false)}>
      <Popover.Target>
        <Flex className={className}>
          <Tooltip label={t`Download full results`}>
            <DownloadIcon
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
              name="download"
              size={20}
              data-testid="download-button"
            />
          </Tooltip>
        </Flex>
      </Popover.Target>
      <Popover.Dropdown>
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
export default connect(null, mapDispatchToProps)(QueryDownloadWidget);
