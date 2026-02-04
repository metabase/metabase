import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { FilterOperatorOption } from "../../../types";

import S from "./FilterOperatorPicker.module.css";

interface FilterOperatorPickerProps<T extends Lib.FilterOperatorName> {
  value: T;
  options: FilterOperatorOption<T>[];
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends string>({
  value,
  options,
  onChange,
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
          <Menu.Item key={index} onClick={() => onChange(option.operator)}>
            {option.displayName}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
