import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { useState } from "react";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Tooltip from "metabase/core/components/Tooltip";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import type { DownloadQueryResultsOpts } from "metabase/query_builder/actions";
import { downloadQueryResults } from "metabase/query_builder/actions";
import type { Dataset, VisualizationSettings } from "metabase-types/api";
import { Flex, Popover } from "metabase/ui";
import type Question from "metabase-lib/Question";
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

  const [{ loading }, handleDownload] = useAsyncFn(
    async (type: string) => {
      await onDownload({
        type,
        question,
        result,
        dashboardId,
        dashcardId,
        uuid,
        token,
        visualizationSettings,
      });
    },
    [question, result, uuid, token, visualizationSettings],
  );

  return (
    <Popover opened={isPopoverOpen} onClose={() => setIsPopoverOpen(false)}>
      <Popover.Target>
        <Flex className={className}>
          {loading ? (
            <Tooltip tooltip={t`Downloading…`}>
              <LoadingSpinner size={18} />
            </Tooltip>
          ) : (
            <Tooltip tooltip={t`Download full results`}>
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
      <Popover.Dropdown>
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={type => {
            setIsPopoverOpen(false);
            handleDownload(type);
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
