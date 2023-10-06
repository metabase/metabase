import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import {
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  NumberInput,
  Select,
} from "metabase/ui";
import type { RelativeDateIntervalValue } from "../types";
import {
  getUnitLabel,
  getIncludeCurrent,
  getInterval,
  getUnitOptions,
  setIncludeCurrent,
  setInterval,
  setUnit,
} from "./utils";

interface DateIntervalPickerProps {
  value: RelativeDateIntervalValue;
  isNew: boolean;
  onChange: (value: RelativeDateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateIntervalPicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: DateIntervalPickerProps) {
  const interval = getInterval(value);
  const options = getUnitOptions(interval);
  const includeCurrent = getIncludeCurrent(value);

  const handleIntervalChange = (inputValue: number | "") => {
    if (inputValue !== "") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = options.find(option => option.value === inputValue);
    if (option) {
      onChange(setUnit(value, option.value));
    }
  };

  const handleIncludeCurrentChange = () => {
    onChange(setIncludeCurrent(value, !includeCurrent));
  };

  return (
    <div>
      <Flex p="md">
        <NumberInput
          value={interval}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          data={options}
          value={value.unit}
          withinPortal={false}
          ml="md"
          onChange={handleUnitChange}
        />
        <Menu withinPortal={false}>
          <Menu.Target>
            <Button
              c="text.2"
              variant="subtle"
              leftIcon={<Icon name="ellipsis" />}
            />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              icon={<Icon name={includeCurrent ? "check" : "calendar"} />}
              onClick={handleIncludeCurrentChange}
            >
              {t`Include ${getUnitLabel(value.unit)}`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
