import React from "react";
import { connect } from "react-redux";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
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

interface OwnProps {
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
            <LoadingSpinner size={18} />
          </Tooltip>
        ) : (
          <Tooltip tooltip={t`Download full results`}>
            <IconButtonWrapper data-testid="download-button" onClick={onClick}>
              <Icon name="download" size={20} />
            </IconButtonWrapper>
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

export default connect(null, mapDispatchToProps)(QueryDownloadWidget);
