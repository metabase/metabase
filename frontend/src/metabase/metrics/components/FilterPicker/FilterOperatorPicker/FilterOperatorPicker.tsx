import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../types";

import S from "./FilterOperatorPicker.module.css";

interface FilterOperatorPickerProps<T extends Lib.FilterOperator> {
  value: T;
  options: FilterOperatorOption<T>[];
  onSelect: (operator: T) => void;
}

export function FilterOperatorPicker<T extends Lib.FilterOperator>({
  value,
  options,
  onSelect,
}: FilterOperatorPickerProps<T>) {
  const selectedOption = options.find((option) => option.operator === value);

  return (
    <Menu>
      <Menu.Target>
        <Button
          fw="normal"
          rightSection={<Icon name="chevrondown" />}
          aria-label={t`Filter operator`}
          className={S.root}
        >
          {selectedOption?.displayName ?? t`Select operator`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map((option, index) => (
          <Menu.Item key={index} onClick={() => onSelect(option.operator)}>
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
