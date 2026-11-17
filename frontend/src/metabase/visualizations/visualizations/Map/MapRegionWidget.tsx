import { Stack } from "metabase/ui";
import {
  ChartSettingSelect,
  type ChartSettingSelectProps,
} from "metabase/visualizations/components/settings/ChartSettingSelect";

import { CustomMapFooter } from "./CustomMapFooter";

export function MapRegionWidget(props: ChartSettingSelectProps) {
  return (
    <Stack gap="md" align="flex-start">
      <ChartSettingSelect {...props} w="100%" />
      <CustomMapFooter />
    </Stack>
  );
}
