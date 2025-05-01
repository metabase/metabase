import { useState } from "react";
import { t } from "ttag";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import type {
  ExportFormat,
  TableExportFormat,
} from "metabase/common/types/export";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  Box,
  Button,
  Icon,
  Stack,
  type StackProps,
  Text,
  Title,
} from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import type { FormatPreference } from "../QuestionDownloadPopover/QuestionDownloadPopover";

type QuestionDownloadWidgetProps = {
  question: Question;
  result: Dataset;
  onDownload: (opts: {
    type: string;
    enableFormatting: boolean;
    enablePivot: boolean;
  }) => void;
  disabled?: boolean;
  formatPreference?: FormatPreference;
  setFormatPreference?: (
    preference: FormatPreference,
  ) => Promise<{ data?: unknown; error?: unknown }>;
} & StackProps;

const canPivotResults = (format: string, display: string) =>
  display === "pivot" && format !== "json";
const canConfigureFormatting = (format: string) => format !== "png";

export const QuestionDownloadWidget = ({
  question,
  result,
  onDownload,
  disabled = false,
  formatPreference,
  setFormatPreference,
  ...stackProps
}: QuestionDownloadWidgetProps) => {
  const canDownloadPng = canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const determineInitialFormat = () => {
    if (!formatPreference) {
      return formats[0];
    }

    const { last_download_format, last_table_download_format } =
      formatPreference;

    if (canDownloadPng) {
      return formats.includes(last_download_format)
        ? last_download_format
        : formats[0];
    }

    return formats.includes(last_table_download_format)
      ? last_table_download_format
      : formats[0];
  };

  const [format, setFormat] = useState<ExportFormat>(determineInitialFormat());
  const canConfigurePivoting = canPivotResults(format, question.display());

  const [isPivoted, setIsPivoted] = useState(canConfigurePivoting);
  const [isFormatted, setIsFormatted] = useState(true);

  const hasTruncatedResults =
    result.data != null && result.data.rows_truncated != null;
  const limitedDownloadSizeText =
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`;

  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat);

    // If user is logged in, save their preference to the KV store
    if (formatPreference !== undefined && setFormatPreference) {
      const newPreference = {
        last_download_format: newFormat,
        last_table_download_format:
          newFormat !== "png"
            ? newFormat
            : (formatPreference?.last_table_download_format as TableExportFormat) ||
              "csv",
      };
      setFormatPreference(newPreference);
    }
  };

  const handleDownload = () => {
    onDownload({
      type: format,
      enableFormatting: isFormatted,
      enablePivot: isPivoted,
    });
  };

  return (
    <Stack
      w={hasTruncatedResults ? "18.75rem" : "16.25rem"}
      p="sm"
      {...stackProps}
    >
      <Title order={4}>{t`Download`}</Title>
      <ExportSettingsWidget
        selectedFormat={format}
        formats={formats}
        isFormattingEnabled={isFormatted}
        isPivotingEnabled={isPivoted}
        canConfigureFormatting={canConfigureFormatting(format)}
        canConfigurePivoting={canConfigurePivoting}
        onChangeFormat={handleFormatChange}
        onToggleFormatting={() => setIsFormatted((prev) => !prev)}
        onTogglePivoting={() => setIsPivoted((prev) => !prev)}
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
        disabled={disabled}
      >{t`Download`}</Button>
    </Stack>
  );
};
