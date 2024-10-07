import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

type Option<T> = {
  name: string;
  operator: T;
};

interface FilterOperatorPickerProps<T> {
  value: T;
  options: Option<T>[];
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends string>({
  value,
  options,
  onChange,
}: FilterOperatorPickerProps<T>) {
  const selectedOption = options.find(option => option.operator === value);

  return (
    <Menu>
      <Menu.Target>
        <Button
          fw="normal"
          rightIcon={<Icon name="chevrondown" />}
          aria-label={t`Filter operator`}
        >
          {selectedOption?.name}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map((option, index) => (
          <Menu.Item key={index} onClick={() => onChange(option.operator)}>
            {option.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
