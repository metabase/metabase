import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { exportFormats } from "metabase/lib/urls";
import { canSavePng } from "metabase/visualizations";
import {
  downloadChartImage,
  downloadQueryResults,
  DownloadQueryResultsOpts,
} from "metabase/query_builder/actions";
import {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  DownloadButtonIcon,
  DownloadButtonRoot,
  DownloadPopoverHeader,
  DownloadPopoverMessage,
  DownloadPopoverRoot,
} from "./QueryDownloadPopover.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  params?: Record<string, unknown>;
  visualizationSettings?: VisualizationSettings;
}

interface StateProps {
  canDownloadImage: boolean;
  hasTruncatedResults: boolean;
  limitedDownloadSizeText: string;
}

interface DispatchProps {
  onDownloadQueryResults: (opts: DownloadQueryResultsOpts) => void;
  onDownloadChartImage: (question: Question) => void;
}

type QueryDownloadPopoverProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (
  state: State,
  { question, result }: OwnProps,
): StateProps => ({
  canDownloadImage: canSavePng(question.display()),
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
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  params,
  visualizationSettings,
  canDownloadImage,
  hasTruncatedResults,
  limitedDownloadSizeText,
  onDownloadQueryResults,
  onDownloadChartImage,
}: QueryDownloadPopoverProps) => {
  const handleQueryResultsDownload = (type: string) => {
    onDownloadQueryResults({
      type,
      question,
      result,
      dashboardId,
      dashcardId,
      uuid,
      token,
      params,
      visualizationSettings,
    });
  };

  const handleChartImageDownload = () => {
    onDownloadChartImage(question);
  };

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
          onClick={() => handleQueryResultsDownload(type)}
        />
      ))}
      {canDownloadImage && (
        <DownloadButton type="png" onClick={handleChartImageDownload} />
      )}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  type: string;
  onClick?: () => void;
}

const DownloadButton = ({ type, onClick }: DownloadButtonProps) => {
  return (
    <DownloadButtonRoot onClick={onClick}>
      <DownloadButtonIcon name={type} />
      {type}
    </DownloadButtonRoot>
  );
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QueryDownloadPopover);
