import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { ExportFormat } from "metabase/common/types/export";
import { useSelector } from "metabase/lib/redux";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Checkbox, Chip, Group, Radio, Stack, Text } from "metabase/ui";

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

  return (
    <Stack>
      <Chip.Group
        value={selectedFormat}
        onChange={(newValue: string | string[]) => {
          Array.isArray(newValue)
            ? onChangeFormat(newValue[0] as ExportFormat)
            : onChangeFormat(newValue as ExportFormat);
        }}
      >
        <Group gap="xs" wrap="nowrap">
          {formats.map((format) => (
            <Chip
              key={format}
              value={format}
              variant="brand"
            >{`.${format}`}</Chip>
          ))}
        </Group>
      </Chip.Group>
      {canConfigureFormatting ? (
        <Stack gap="xs">
          <Radio.Group
            value={isFormattingEnabled ? "true" : "false"}
            onChange={() => onToggleFormatting()}
          >
            <Group>
              <Radio value="true" label={t`Formatted`} />
              <Radio value="false" label={t`Unformatted`} />
            </Group>
          </Radio.Group>

          <Text
            data-testid="formatting-description"
            size="sm"
            color="text-medium"
          >
            {formattingLabel}
          </Text>
        </Stack>
      ) : null}
      {arePivotedExportsEnabled && canConfigurePivoting ? (
        <Checkbox
          data-testid="keep-data-pivoted"
          label={t`Keep data pivoted`}
          checked={isPivotingEnabled}
          onChange={() => onTogglePivoting()}
        />
      ) : null}
    </Stack>
  );
};
