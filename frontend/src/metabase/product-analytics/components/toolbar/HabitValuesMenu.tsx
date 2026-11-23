import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

import type { HabitValues } from "../../analyses/types";

const getButtonLabel = (value: HabitValues): string => {
  switch (value) {
    case "count":
      return t`Count`;
    case "percent":
      return t`Percent`;
  }
};

const getOptionLabel = (value: HabitValues): string => {
  switch (value) {
    case "count":
      return t`Raw count of people`;
    case "percent":
      return t`Share of total people`;
  }
};

type HabitValuesMenuProps = {
  value: HabitValues;
  onChange: (value: HabitValues) => void;
};

/** Toggle the habit chart between raw people counts and share-of-total percentages. */
export const HabitValuesMenu = ({ value, onChange }: HabitValuesMenuProps) => (
  <Menu>
    <Menu.Target>
      <Button variant="default" leftSection={<Icon name="number" />}>
        {getButtonLabel(value)}
      </Button>
    </Menu.Target>
    <Menu.Dropdown>
      {(["count", "percent"] as const).map((option) => (
        <Menu.Item key={option} onClick={() => onChange(option)}>
          {getOptionLabel(option)}
        </Menu.Item>
      ))}
    </Menu.Dropdown>
  </Menu>
);
