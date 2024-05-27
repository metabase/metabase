import { useCallback, useState } from "react";
import { connect } from "react-redux";
import { useEvent } from "react-use";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
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

// Excel and images always use formatting
const checkCanManageFormatting = (format: string) =>
  format !== "xlsx" && format !== "png";

const QueryDownloadPopover = ({
  canDownloadPng,
  hasTruncatedResults,
  limitedDownloadSizeText,
  onDownload,
}: QueryDownloadPopoverProps) => {
  const [isHoldingAltKey, setHoldingAltKey] = useState(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Alt") {
      setHoldingAltKey(true);
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === "Alt") {
      setHoldingAltKey(false);
    }
  }, []);

  useEvent("keydown", handleKeyDown);

  useEvent("keyup", handleKeyUp);

  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const handleDownload = (type: string, enableFormatting: boolean) => {
    const canManageFormatting = checkCanManageFormatting(type);
    onDownload({
      type,
      enableFormatting: canManageFormatting ? enableFormatting : true,
    });
  };

  const formattingInfoTooltipLabel = isMac()
    ? t`Hold the Option key to download unformatted results`
    : t`Hold the Alt key to download unformatted results`;

  return (
    <DownloadPopoverRoot isExpanded={hasTruncatedResults}>
      <DownloadPopoverHeader>
        <h4>{t`Download full results`}</h4>
        <Tooltip label={formattingInfoTooltipLabel}>
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
          hasUnformattedOption={checkCanManageFormatting(format)}
          isHoldingAltKey={isHoldingAltKey}
          onDownload={handleDownload}
        />
      ))}
    </DownloadPopoverRoot>
  );
};

interface DownloadButtonProps {
  format: string;
  hasUnformattedOption: boolean;
  isHoldingAltKey: boolean;
  onDownload: (format: string, enableFormatting: boolean) => void;
}

const DownloadButton = ({
  format,
  hasUnformattedOption,
  isHoldingAltKey,
  onDownload,
}: DownloadButtonProps) => {
  const { hovered, ref } = useHover<HTMLButtonElement>();

  return (
    <DownloadButtonRoot
      onClick={() => onDownload(format, !isHoldingAltKey)}
      ref={ref}
    >
      <DownloadButtonText>.{format}</DownloadButtonText>
      {hasUnformattedOption && isHoldingAltKey && hovered && (
        <DownloadButtonSecondaryText>{t`(Unformatted)`}</DownloadButtonSecondaryText>
      )}
    </DownloadButtonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(QueryDownloadPopover);
