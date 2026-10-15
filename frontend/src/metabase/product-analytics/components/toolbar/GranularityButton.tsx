import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { TemporalUnitPicker } from "metabase/querying/common/components/TemporalUnitPicker";
import { Button, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { SettingWidgetProps } from "../../settings/types";
import type { Granularity } from "../../spec/types";

type GranularityButtonProps = SettingWidgetProps<Granularity> & {
  units?: Granularity[];
};

export const GranularityButton = ({
  value,
  onChange,
  units = [],
}: GranularityButtonProps) => {
  const [opened, { open, close }] = useDisclosure();
  const items = units.map((unit) => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));

  return (
    <Popover
      opened={opened}
      onChange={(isOpened) => (isOpened ? open() : close())}
      position="bottom-end"
    >
      <Popover.Target>
        <Button variant="default">
          {t`by ${Lib.describeTemporalUnit(value).toLowerCase()}`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <TemporalUnitPicker
          value={value}
          availableItems={items}
          onChange={(unit) => {
            const selected = units.find((item) => item === unit);
            if (selected !== undefined) {
              onChange(selected);
              close();
            }
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
