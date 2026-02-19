import { useState } from "react";
import { t } from "ttag";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl, useUserSetting } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import type {
  ExportFormat,
  TableExportFormat,
} from "metabase/common/types/export";
import CS from "metabase/css/core/index.css";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  Box,
  Button,
  Flex,
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
  }) => Promise<void>;
  disabled?: boolean;
  formatPreference?: FormatPreference;
} & StackProps;

// Helper functions moved outside component
const canPivotResults = (format: string, display: string) =>
  display === "pivot" && format !== "json";
const canConfigureFormatting = (format: string) => format !== "png";

const getInitialFormat = (
  formatPreference: FormatPreference | undefined,
  formats: ExportFormat[],
  canDownloadPng: boolean,
): ExportFormat => {
  if (!formatPreference) {
    return formats[0];
  }

  const preferredFormat = canDownloadPng
    ? formatPreference.last_download_format
    : formatPreference.last_table_download_format;

  return formats.includes(preferredFormat) ? preferredFormat : formats[0];
};

export const QuestionDownloadWidget = ({
  question,
  result,
  onDownload,
  disabled = false,
  formatPreference: formatPreferenceOverride,
  ...stackProps
}: QuestionDownloadWidgetProps) => {
  const canDownloadPng = canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const { value: formatPreference, setValue: setFormatPreference } =
    useUserKeyValue({
      namespace: "last_download_format",
      key: "download_format_preference",
      defaultValue: formatPreferenceOverride ?? {
        last_download_format: formats[0],
        last_table_download_format: exportFormats[0],
      },
      skip: !!formatPreferenceOverride,
    });

  const initialFormat = getInitialFormat(
    formatPreference,
    formats,
    canDownloadPng,
  );

  // Derive format instead of using useEffect
  const [userSelectedFormat, setUserSelectedFormat] =
    useState<ExportFormat | null>(null);
  const format = userSelectedFormat ?? initialFormat;

  const canConfigurePivoting = canPivotResults(format, question.display());
  const [isPivoted, setIsPivoted] = useState(canConfigurePivoting);
  const [isFormatted, setIsFormatted] = useState(true);

  const hasTruncatedResults =
    result.data != null && result.data.rows_truncated != null;
  const limitedDownloadSizeText =
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.getDownloadWidgetMessageOverride(result) ??
    t`The maximum download size is 1 million rows.`;

  const [loading, setLoading] = useState(false);

  const handleFormatChange = (newFormat: ExportFormat) => {
    setUserSelectedFormat(newFormat);

    // Save preference if user is logged in
    if (newFormat && setFormatPreference) {
      setFormatPreference({
        last_download_format: newFormat,
        last_table_download_format:
          newFormat !== "png"
            ? newFormat
            : (formatPreference.last_table_download_format as TableExportFormat) ||
              "csv",
      });
    }
  };

  const { url: pivotExcelExportsDocsLink, showMetabaseLinks } = useDocsUrl(
    "questions/exporting-results",
    { anchor: "exporting-pivot-tables" },
  );

  const [
    dismissedExcelPivotExportsBanner,
    setDismissedExcelPivotExportsBanner,
  ] = useUserSetting("dismissed-excel-pivot-exports-banner");

  const handleDownload = async () => {
    setLoading(true);

    await onDownload({
      type: format,
      enableFormatting: isFormatted,
      enablePivot: isPivoted,
    });

    setLoading(false);
  };

  const showPivotXlsxExportHint =
    format === "xlsx" &&
    isPivoted &&
    !dismissedExcelPivotExportsBanner &&
    showMetabaseLinks;

  return (
    <Stack {...stackProps} w={336} p="0.75rem" gap="lg">
      <Title order={5}>{t`Download data`}</Title>
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
      {showPivotXlsxExportHint && (
        <Flex
          p="md"
          bg="background-secondary"
          align="center"
          justify="space-between"
          className={CS.rounded}
        >
          <Text fz="12px" lh="16px" c="text-secondary">
            {t`Trying to pivot this data in Excel? You should download the raw data instead.`}{" "}
            <Link
              target="_new"
              to={pivotExcelExportsDocsLink}
              style={{ color: "var(--mb-color-brand)" }}
            >
              {t`Read the docs`}
            </Link>
          </Text>
          <Button
            aria-label={t`Close hint`}
            pl={8}
            pr={0}
            variant="subtle"
            size="compact-md"
            style={{ flexShrink: 0 }}
          >
            <Icon
              name="close"
              c="text-secondary"
              tooltip={t`Don't show me this again.`}
              onClick={() => setDismissedExcelPivotExportsBanner(true)}
            />
          </Button>
        </Flex>
      )}
      {hasTruncatedResults && (
        <Box>
          <Text
            size="sm"
            c="text-secondary"
            mb="1rem"
          >{t`Your answer has a large number of rows so it could take a while to download.`}</Text>

          {format === "xlsx" && (
            <Text size="sm" c="text-secondary">
              {limitedDownloadSizeText}
            </Text>
          )}
        </Box>
      )}
      <Button
        data-testid="download-results-button"
        mt="auto"
        ml="auto"
        variant="filled"
        loading={loading}
        onClick={handleDownload}
        disabled={disabled}
      >{t`Download`}</Button>
    </Stack>
  );
};
