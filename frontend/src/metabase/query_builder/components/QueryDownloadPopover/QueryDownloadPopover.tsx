import { useState } from "react";
import { useKeyPressEvent } from "react-use";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Group, Icon, Stack, Text, Title, Tooltip } from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { DownloadButton } from "./DownloadButton";
import { checkCanManageFormatting } from "./utils";

type QueryDownloadPopoverProps = {
  question: Question;
  result: Dataset;
  onDownload: (opts: { type: string; enableFormatting: boolean }) => void;
};

const getFormattingInfoTooltipLabel = () => {
  return isMac()
    ? t`Hold the Option key to download unformatted results`
    : t`Hold the Alt key to download unformatted results`;
};

export const QueryDownloadPopover = ({
  question,
  result,
  onDownload,
}: QueryDownloadPopoverProps) => {
  const canDownloadPng = canSavePng(question.display());
  const hasTruncatedResults =
    result.data != null && result.data.rows_truncated != null;
  const limitedDownloadSizeText =
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`;

  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const [isAltPressed, toggleAltPressed] = useState(false);
  useKeyPressEvent(
    e => e.key === "Alt" || e.key === "Option",
    () => {
      toggleAltPressed(true);
    },
    () => {
      toggleAltPressed(false);
    },
  );

  return (
    <Stack w={hasTruncatedResults ? "18.75rem" : "16.25rem"}>
      <Group align="center" position="apart" px="sm">
        <Title order={4}>{t`Download full results`}</Title>
        <Tooltip label={getFormattingInfoTooltipLabel()}>
          <Icon name="info_filled" />
        </Tooltip>
      </Group>

      {hasTruncatedResults && (
        <Text px="sm">
          <div>{t`Your answer has a large number of rows so it could take a while to download.`}</div>
          <div>{limitedDownloadSizeText}</div>
        </Text>
      )}

      <Stack gap="sm">
        {formats.map(format => (
          <DownloadButton
            key={format}
            format={format}
            onClick={() => {
              onDownload({
                type: format,
                enableFormatting: !(
                  checkCanManageFormatting(format) && isAltPressed
                ),
              });
            }}
            isAltPressed={isAltPressed}
          />
        ))}
      </Stack>
    </Stack>
  );
};
