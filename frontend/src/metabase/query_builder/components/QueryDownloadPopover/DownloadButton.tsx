import { t } from "ttag";

import type { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { Group, Text, UnstyledButton } from "metabase/ui";

import DownloadButtonS from "./DownloadButton.module.css";
import { checkCanManageFormatting } from "./utils";

type DownloadButtonProps = {
  format: (typeof exportFormats)[number] | typeof exportFormatPng;
  onClick: () => void;
  isAltPressed: boolean;
};
export const DownloadButton = ({
  format,
  onClick,
  isAltPressed,
}: DownloadButtonProps) => {
  const showUnformattedInfo = checkCanManageFormatting(format) && isAltPressed;

  return (
    <UnstyledButton onClick={onClick}>
      <Group
        className={DownloadButtonS.DownloadButton}
        py="xs"
        px="sm"
        fw="bold"
        justify="space-between"
      >
        <Text c="inherit">{`.${format}`}</Text>
        {showUnformattedInfo && (
          <Text className={DownloadButtonS.UnformattedTextInfo} c="inherit">
            ({t`Unformatted`})
          </Text>
        )}
      </Group>
    </UnstyledButton>
  );
};
