import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { ExportFormat } from "metabase/common/types/export";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Checkbox, SegmentedControl, Stack } from "metabase/ui";

interface ExportSettingsWidgetProps {
  formats: ExportFormat[];
  selectedFormat: ExportFormat;
  isFormattingEnabled: boolean;
  isPivotingEnabled: boolean;
  canConfigurePivoting?: boolean;
  canConfigureFormatting?: boolean;
  onChangeFormat: (format: ExportFormat) => void;
  onTogglePivoting: () => void;
  onToggleFormatting: () => void;
}

const useFormattingLabel = ({
  isFormattingEnabled,
}: {
  isFormattingEnabled: boolean;
}) => {
  const applicationName = useSelector(getApplicationName);
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);

  return match({ isFormattingEnabled, isEmbeddingSdk })
    .with(
      { isEmbeddingSdk: true, isFormattingEnabled: true },
      () =>
        c(
          "Refers to formatting for a piece of data, like long or short form dates, or currency",
        ).t`E.g. September 6, 2024 or $187.50`,
    )
    .with(
      { isEmbeddingSdk: true, isFormattingEnabled: false },
      () =>
        c(
          "Refers to formatting for a piece of data, like long or short form dates, or currency",
        ).t`E.g. 2024-09-06 or 187.50`,
    )
    .with(
      { isEmbeddingSdk: false, isFormattingEnabled: true },
      () =>
        c(
          // eslint-disable-next-line no-literal-metabase-strings -- used for translation context
          "Refers to formatting for a piece of data, like long or short form dates, or currency. {0} is the name of the application, typically Metabase.",
        ).t`E.g. September 6, 2024 or $187.50, like in ${applicationName}`,
    )
    .with(
      { isEmbeddingSdk: false, isFormattingEnabled: false },
      () =>
        c(
          "Refers to formatting for a piece of data, like long or short form dates, or currency.",
        ).t`E.g. 2024-09-06 or 187.50, like in the database`,
    )
    .exhaustive();
};

export const ExportSettingsWidget = ({
  formats,
  selectedFormat,
  isFormattingEnabled,
  isPivotingEnabled,
  canConfigureFormatting,
  canConfigurePivoting,
  onChangeFormat,
  onToggleFormatting,
  onTogglePivoting,
}: ExportSettingsWidgetProps) => {
  const arePivotedExportsEnabled = useSetting("enable-pivoted-exports") ?? true;

  const formattingLabel = useFormattingLabel({ isFormattingEnabled });
  const formatOptions = formats.map((format) => ({
    label: `.${format}`,
    value: format,
  }));

  return (
    <Stack gap="lg">
      <SegmentedControl
        w="100%"
        data={formatOptions}
        value={selectedFormat}
        onChange={onChangeFormat}
      />

      {canConfigureFormatting ? (
        <Checkbox
          data-testid="keep-data-formatted"
          label={t`Keep the data formatted`}
          checked={isFormattingEnabled}
          onChange={() => onToggleFormatting()}
          description={formattingLabel}
          styles={{ inner: { alignSelf: "flex-start" } }}
        />
      ) : null}
      {arePivotedExportsEnabled && canConfigurePivoting ? (
        <Checkbox
          data-testid="keep-data-pivoted"
          label={t`Keep the data pivoted`}
          checked={isPivotingEnabled}
          onChange={() => onTogglePivoting()}
        />
      ) : null}
    </Stack>
  );
};
