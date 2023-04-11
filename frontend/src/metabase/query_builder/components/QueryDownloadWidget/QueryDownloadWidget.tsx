import React from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  downloadQueryResults,
  DownloadQueryResultsOpts,
} from "metabase/query_builder/actions";
import { Dataset, VisualizationSettings } from "metabase-types/api";
import Question from "metabase-lib/Question";
import QueryDownloadPopover from "../QueryDownloadPopover";
import { DownloadIconButton } from "./QueryDownloadWidget.styled";

interface OwnProps {
  className?: string;
  question: Question;
  result: Dataset;
  uuid?: string;
  token?: string;
  visualizationSettings?: VisualizationSettings;
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
  uuid,
  token,
  onDownload,
}: QueryDownloadWidgetProps) => {
  const [{ loading }, handleDownload] = useAsyncFn(
    async (type: string) => {
      await onDownload({ type, question, result, uuid, token });
    },
    [question, result, uuid, token],
  );

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) =>
        loading ? (
          <Tooltip tooltip={t`Downloading…`}>
            <LoadingSpinner className={className} size={18} />
          </Tooltip>
        ) : (
          <Tooltip tooltip={t`Download full results`}>
            <DownloadIconButton
              className={className}
              data-testid="download-button"
              onClick={onClick}
            >
              <Icon name="download" size={20} />
            </DownloadIconButton>
          </Tooltip>
        )
      }
      popoverContent={
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={handleDownload}
        />
      }
    />
  );
};

interface QueryDownloadWidgetOpts {
  result: Dataset;
  isResultDirty?: boolean;
}

QueryDownloadWidget.shouldRender = ({
  result,
  isResultDirty,
}: QueryDownloadWidgetOpts) => {
  return (
    !isResultDirty &&
    result &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

export default connect(null, mapDispatchToProps)(QueryDownloadWidget);
