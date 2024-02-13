import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Tooltip from "metabase/core/components/Tooltip";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { DownloadQueryResultsOpts } from "metabase/query_builder/actions";
import { downloadQueryResults } from "metabase/query_builder/actions";
import type { Dataset, VisualizationSettings } from "metabase-types/api";
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
    <TippyPopoverWithTrigger
      triggerClasses={className}
      triggerContent={
        loading ? (
          <Tooltip tooltip={t`Downloading…`}>
            <LoadingSpinner size={18} />
          </Tooltip>
        ) : (
          <Tooltip tooltip={t`Download full results`}>
            <DownloadIcon
              name="download"
              size={20}
              data-testid="download-button"
            />
          </Tooltip>
        )
      }
      popoverContent={({ closePopover }) => (
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={type => {
            closePopover();
            handleDownload(type);
          }}
        />
      )}
    />
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
