import React from "react";
import { t } from "ttag";
import {
  DownloadButtonIcon,
  DownloadButtonRoot,
  DownloadPopoverHeader,
  DownloadPopoverMessage,
  DownloadPopoverRoot,
} from "./QueryDownloadPopover.styled";

interface StateProps {
  formats: string[];
  hasTruncatedResults: boolean;
  limitedDownloadSizeText: string;
}

type QueryDownloadPopoverProps = StateProps;

const QueryDownloadPopover = ({
  formats,
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
      {formats.map(format => (
        <DownloadButton key={format} format={format} />
      ))}
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

export default QueryDownloadPopover;
