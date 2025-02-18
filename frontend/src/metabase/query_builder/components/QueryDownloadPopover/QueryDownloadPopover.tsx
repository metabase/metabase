import { useCallback, useState } from "react";
import { t } from "ttag";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import type { ExportFormat } from "metabase/common/types/export";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Box, Button, Icon, Stack, Text, Title } from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

type QueryDownloadPopoverProps = {
  question: Question;
  result: Dataset;
  onDownload: (opts: {
    type: string;
    enableFormatting: boolean;
    enablePivot: boolean;
  }) => void;
};

const canPivotResults = (format: string, display: string) =>
  display === "pivot" && format !== "json";
const canConfigureFormatting = (format: string) => format !== "png";

export const QueryDownloadPopover = ({
  question,
  result,
  onDownload,
}: QueryDownloadPopoverProps) => {
  const canDownloadPng = canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const [format, setFormat] = useState<ExportFormat>(formats[0]);
  const canConfigurePivoting = canPivotResults(format, question.display());

  const [isPivoted, setIsPivoted] = useState(canConfigurePivoting);
  const [isFormatted, setIsFormatted] = useState(true);

  const hasTruncatedResults =
    result.data != null && result.data.rows_truncated != null;
  const limitedDownloadSizeText =
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`;

  const handleDownload = useCallback(() => {
    onDownload({
      type: format,
      enableFormatting: isFormatted,
      enablePivot: isPivoted,
    });
  }, [format, isFormatted, isPivoted, onDownload]);

  return (
    <Stack w={hasTruncatedResults ? "18.75rem" : "16.25rem"} p={8}>
      <Title order={4}>{t`Download`}</Title>
      <ExportSettingsWidget
        selectedFormat={format}
        formats={formats}
        isFormattingEnabled={isFormatted}
        isPivotingEnabled={isPivoted}
        canConfigureFormatting={canConfigureFormatting(format)}
        canConfigurePivoting={canConfigurePivoting}
        onChangeFormat={setFormat}
        onToggleFormatting={() => setIsFormatted(prev => !prev)}
        onTogglePivoting={() => setIsPivoted(prev => !prev)}
      />
      {hasTruncatedResults && (
        <Box>
          <Text
            size="sm"
            c="text-medium"
            mb="1rem"
          >{t`Your answer has a large number of rows so it could take a while to download.`}</Text>

          <Text size="sm" c="text-medium">
            {limitedDownloadSizeText}
          </Text>
        </Box>
      )}
      <Button
        data-testid="download-results-button"
        leftSection={<Icon name="download" />}
        variant="filled"
        onClick={handleDownload}
      >{t`Download`}</Button>
    </Stack>
  );
};
