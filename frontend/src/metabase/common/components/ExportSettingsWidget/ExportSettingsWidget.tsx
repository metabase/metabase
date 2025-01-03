import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { ExportFormat } from "metabase/common/types/export";
import { useSelector } from "metabase/lib/redux";
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
  const applicationName = useSelector(getApplicationName);
  return (
    <Stack>
      <Chip.Group value={selectedFormat} onChange={onChangeFormat}>
        <Group spacing="xs" noWrap>
          {formats.map(format => (
            <Chip
              key={format}
              value={format}
              variant="brand"
            >{`.${format}`}</Chip>
          ))}
        </Group>
      </Chip.Group>
      {canConfigureFormatting ? (
        <Stack spacing="xs">
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
            {isFormattingEnabled
              ? t`E.g. September 6, 2024 or $187.50, like in ${applicationName}`
              : t`E.g. 2024-09-06 or 187.50, like in the database`}
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
