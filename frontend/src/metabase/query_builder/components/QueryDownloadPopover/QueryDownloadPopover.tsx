import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { exportFormats } from "metabase/lib/urls";
import { canSavePng } from "metabase/visualizations";
import { Dataset } from "metabase-types/api";
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
}

interface StateProps {
  canDownloadImage: boolean;
  hasTruncatedResults: boolean;
  limitedDownloadSizeText: string;
}

type QueryDownloadPopoverProps = StateProps;

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

const QueryDownloadPopover = ({
  canDownloadImage,
  hasTruncatedResults,
  limitedDownloadSizeText,
}: QueryDownloadPopoverProps) => {
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
      {exportFormats.map(format => (
        <DownloadButton key={format} format={format} />
      ))}
      {canDownloadImage && <DownloadButton format="png" />}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  format: string;
  onClick?: () => void;
}

const DownloadButton = ({ format, onClick }: DownloadButtonProps) => {
  return (
    <DownloadButtonRoot onClick={onClick}>
      <DownloadButtonIcon name={format} />
      {format}
    </DownloadButtonRoot>
  );
};

export default connect(mapStateToProps)(QueryDownloadPopover);
