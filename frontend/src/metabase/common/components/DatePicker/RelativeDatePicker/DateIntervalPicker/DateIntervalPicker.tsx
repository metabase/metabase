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
import type { DateIntervalValue } from "../types";
import { getInterval, setInterval, getUnitOptions } from "../utils";
import {
  getIncludeCurrentLabel,
  getIncludeCurrent,
  setIncludeCurrent,
  setUnit,
  setDefaultOffset,
} from "./utils";

interface DateIntervalPickerProps {
  value: DateIntervalValue;
  isNew: boolean;
  onChange: (value: DateIntervalValue) => void;
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

  const handleStartingFromClick = () => {
    onChange(setDefaultOffset(value));
  };

  const handleIncludeCurrentClick = () => {
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
              icon={<Icon name="arrow_left_to_line" />}
              onClick={handleStartingFromClick}
            >
              {t`Starting from…`}
            </Menu.Item>
            <Menu.Item
              icon={<Icon name={includeCurrent ? "check" : "calendar"} />}
              onClick={handleIncludeCurrentClick}
            >
              {t`Include ${getIncludeCurrentLabel(value.unit)}`}
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
