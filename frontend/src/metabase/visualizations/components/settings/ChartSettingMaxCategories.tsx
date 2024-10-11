import { useCallback } from "react";
import { t } from "ttag";

import { Checkbox, Stack, Text } from "metabase/ui";

import { ChartSettingInputNumeric } from "./ChartSettingInputNumeric";
import type { ChartSettingWidgetProps } from "./types";

export interface ChartSettingMaxCategoriesProps
  extends ChartSettingWidgetProps<number> {
  isEnabled?: boolean;
}

export const ChartSettingMaxCategories = ({
  isEnabled,
  ...props
}: ChartSettingMaxCategoriesProps) => {
  const { onChangeSettings } = props;

  const handleToggleMaxNumberOfSeries = useCallback(
    (value: boolean) => {
      onChangeSettings({ "graph.max_categories_enabled": value });
    },
    [onChangeSettings],
  );

  return (
    <Stack spacing="md">
      <Checkbox
        checked={isEnabled}
        label={t`Enforce maximum number of series`}
        onChange={e => handleToggleMaxNumberOfSeries(e.target.checked)}
      />
      <ChartSettingInputNumeric {...props} />
      <Text>{t`Series after this number will be grouped into "Other"`}</Text>
    </Stack>
  );
};
