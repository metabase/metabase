import { useMemo } from "react";
import { t } from "ttag";

import { Button, Menu, Icon } from "metabase/ui";

type Option<T> = {
  name: string;
  operator: T;
};

interface FilterOperatorPickerProps<T> {
  value: T;
  options: Option<T>[];
  disabled?: boolean;
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: FilterOperatorPickerProps<T>) {
  const label = useMemo(() => {
    const option = options.find(option => option.operator === value);
    return option ? option.name.toLowerCase() : t`operator`;
  }, [value, options]);

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          variant="subtle"
          disabled={disabled}
          color="brand"
          td={disabled ? "none" : "underline"}
          rightIcon={<Icon name="chevrondown" size={8} />}
          p="xs"
          aria-label={t`Filter operator`}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map(option => (
          <Menu.Item
            key={option.operator}
            aria-selected={option.operator === value}
            onClick={() => onChange(option.operator)}
          >
            {option.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
