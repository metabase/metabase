import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { useEvent } from "react-use";
import { t } from "ttag";

import { exportFormats, exportFormatPng } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Icon, Tooltip, useHover } from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  DownloadButtonRoot,
  DownloadButtonSecondaryText,
  DownloadButtonText,
  DownloadPopoverHeader,
  DownloadPopoverMessage,
  DownloadPopoverRoot,
} from "./QueryDownloadPopover.styled";

interface OwnProps {
  question: Question;
  result: Dataset;
  onDownload: (opts: { type: string; enableFormatting: boolean }) => void;
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
  const [isFormattingEnabled, setFormattingEnabled] = useState(true);

  useEvent("keydown", event => {
    if (event.key === "Alt") {
      setFormattingEnabled(false);
    }
  });

  useEvent("keyup", () => {
    setFormattingEnabled(true);
  });

  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const handleDownload = (type: string) => {
    onDownload({ type, enableFormatting: isFormattingEnabled });
  };

  return (
    <DownloadPopoverRoot isExpanded={hasTruncatedResults}>
      <DownloadPopoverHeader>
        <h4>{t`Download full results`}</h4>
        <Tooltip label={t`Option click to download without formatting applied`}>
          <Icon name="info_filled" />
        </Tooltip>
      </DownloadPopoverHeader>
      {hasTruncatedResults && (
        <DownloadPopoverMessage>
          <div>{t`Your answer has a large number of rows so it could take a while to download.`}</div>
          <div>{limitedDownloadSizeText}</div>
        </DownloadPopoverMessage>
      )}
      {formats.map(format => (
        <DownloadButton
          key={format}
          format={format}
          // Excel files are always formatted
          isFormattingEnabled={isFormattingEnabled || format === "xlsx"}
          onDownload={handleDownload}
        />
      ))}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  format: string;
  isFormattingEnabled: boolean;
  onDownload: (format: string) => void;
}

const DownloadButton = ({
  format,
  isFormattingEnabled,
  onDownload,
}: DownloadButtonProps) => {
  const { hovered, ref } = useHover<HTMLButtonElement>();

  const handleClick = useCallback(() => {
    onDownload(format);
  }, [format, onDownload]);

  return (
    <DownloadButtonRoot onClick={handleClick} ref={ref}>
      <DownloadButtonText>.{format}</DownloadButtonText>
      {hovered && !isFormattingEnabled && (
        <DownloadButtonSecondaryText>{t`(Unformatted)`}</DownloadButtonSecondaryText>
      )}
    </DownloadButtonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(QueryDownloadPopover);
