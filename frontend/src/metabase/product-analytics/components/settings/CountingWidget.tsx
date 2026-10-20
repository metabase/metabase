import { t } from "ttag";

import { Radio, Stack } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";
import type { Grain } from "../../spec/types";

const getGrainLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`People`;
    case "session":
      return t`Sessions`;
    case "event":
      return t`Events`;
  }
};

type CountingWidgetProps = SettingWidgetProps<Grain> & {
  options?: Grain[];
};

export const CountingWidget = ({
  value,
  onChange,
  options = [],
}: CountingWidgetProps) => (
  <Radio.Group
    value={value}
    onChange={(next) => {
      const grain = options.find((option) => option === next);
      if (grain !== undefined) {
        onChange(grain);
      }
    }}
  >
    <Stack gap="sm">
      {options.map((grain) => (
        <Radio key={grain} value={grain} label={getGrainLabel(grain)} />
      ))}
    </Stack>
  </Radio.Group>
);
