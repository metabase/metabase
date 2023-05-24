import React, { useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { exportFormats, exportFormatPng } from "metabase/lib/urls";
import { canSavePng } from "metabase/visualizations";
import { Dataset } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  DownloadButtonRoot,
  DownloadButtonText,
  DownloadPopoverHeader,
  DownloadPopoverMessage,
  DownloadPopoverRoot,
} from "./QueryDownloadPopover.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  onDownload: (format: string) => void;
}

interface StateProps {
  canDownloadPng: boolean;
  hasTruncatedResults: boolean;
  limitedDownloadSizeText: string;
}

type QueryDownloadPopoverProps = OwnProps & StateProps;

const mapStateToProps = (
  state: State,
  { question, result }: OwnProps,
): StateProps => ({
  canDownloadPng: canSavePng(question.display()),
  hasTruncatedResults:
    result.data != null && result.data.rows_truncated != null,
  limitedDownloadSizeText:
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`,
});

const QueryDownloadPopover = ({
  canDownloadPng,
  hasTruncatedResults,
  limitedDownloadSizeText,
  onDownload,
}: QueryDownloadPopoverProps) => {
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

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
      {formats.map(format => (
        <DownloadButton key={format} format={format} onDownload={onDownload} />
      ))}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  format: string;
  onDownload: (format: string) => void;
}

const DownloadButton = ({ format, onDownload }: DownloadButtonProps) => {
  const handleClick = useCallback(() => {
    onDownload(format);
  }, [format, onDownload]);

  return (
    <DownloadButtonRoot onClick={handleClick}>
      <DownloadButtonText>.{format}</DownloadButtonText>
    </DownloadButtonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(QueryDownloadPopover);
