import React, { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { exportFormats } from "metabase/lib/urls";
import { canSavePng } from "metabase/visualizations";
import {
  downloadChartImage,
  DownloadQueryContext,
  downloadQueryResults,
} from "metabase/query_builder/actions/downloading";
import { Dataset } from "metabase-types/api";
import { State } from "metabase-types/store";
import {
  DownloadButtonIcon,
  DownloadButtonRoot,
  DownloadPopoverHeader,
  DownloadPopoverMessage,
  DownloadPopoverRoot,
} from "./QueryDownloadPopover.styled";

interface OwnProps {
  context: DownloadQueryContext;
  result: Dataset;
}

interface StateProps {
  canDownloadImage: boolean;
  hasTruncatedResults: boolean;
  limitedDownloadSizeText: string;
}

interface DispatchProps {
  onDownloadQueryResults: (type: string, context: DownloadQueryContext) => void;
  onDownloadChartImage: (context: DownloadQueryContext) => void;
}

type QueryDownloadPopoverProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (
  state: State,
  { context, result }: OwnProps,
): StateProps => ({
  canDownloadImage: canSavePng(context.question.display()),
  hasTruncatedResults:
    result.data != null && result.data.rows_truncated != null,
  limitedDownloadSizeText:
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`,
});

const mapDispatchToProps: DispatchProps = {
  onDownloadQueryResults: downloadQueryResults,
  onDownloadChartImage: downloadChartImage,
};

const QueryDownloadPopover = ({
  context,
  canDownloadImage,
  hasTruncatedResults,
  limitedDownloadSizeText,
  onDownloadQueryResults,
  onDownloadChartImage,
}: QueryDownloadPopoverProps) => {
  const handleQueryResultsDownload = useCallback(
    (type: string) => onDownloadQueryResults(type, context),
    [context, onDownloadQueryResults],
  );

  const handleChartImageDownload = useCallback(
    () => onDownloadChartImage(context),
    [context, onDownloadChartImage],
  );

  return (
    <DownloadPopoverRoot isExpanded={hasTruncatedResults}>
      <DownloadPopoverHeader>
        <h4>{t`Download full results`}</h4>
      </DownloadPopoverHeader>
      {hasTruncatedResults && (
        <DownloadPopoverMessage>
          <div>{t`Your answer has a large number of rows so it could take a while to download.`}</div>
          <div>{limitedDownloadSizeText}</div>
        </DownloadPopoverMessage>
      )}
      {exportFormats.map(type => (
        <DownloadButton
          key={type}
          type={type}
          onDownload={handleQueryResultsDownload}
        />
      ))}
      {canDownloadImage && (
        <DownloadButton type="png" onDownload={handleChartImageDownload} />
      )}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  type: string;
  onDownload: (type: string) => void;
}

const DownloadButton = ({ type, onDownload }: DownloadButtonProps) => {
  const handleClick = useCallback(() => onDownload(type), [type, onDownload]);

  return (
    <DownloadButtonRoot onClick={handleClick}>
      <DownloadButtonIcon name={type} />
      {type}
    </DownloadButtonRoot>
  );
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QueryDownloadPopover);
