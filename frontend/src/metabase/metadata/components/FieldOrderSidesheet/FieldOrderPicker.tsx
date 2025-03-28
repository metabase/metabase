import { useMemo } from "react";
import { t } from "ttag";

import {
  Button,
  Combobox,
  Icon,
  Select,
  type SelectProps,
  useCombobox,
} from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableFieldOrder;
  onChange: (value: TableFieldOrder) => void;
}

export const FieldOrderPicker = ({ value, onChange, ...props }: Props) => {
  const combobox = useCombobox();
  const data = useMemo(() => getData(), []);
  const label = data.find((option) => option.value === value)?.label;

  const handleChange = (value: TableFieldOrder) => {
    onChange(value);
    combobox.closeDropdown();
  };

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
        },
        position: "bottom-start",
        store: combobox,
        width: 300,
      }}
      data={data}
      fw="bold"
      inputContainer={() => (
        <Combobox.Target>
          <Button
            aria-label={t`Sort`}
            leftSection={<Icon name="sort_arrows" />}
            p={0}
            variant="subtle"
            onClick={() => combobox.toggleDropdown()}
          >
            {label}
          </Button>
        </Combobox.Target>
      )}
      value={value}
      onChange={handleChange}
      onOptionSubmit={() => combobox.closeDropdown()}
      {...props}
    />
  );
};

function getData() {
  return [
    { label: t`Database`, value: "database" as const },
    { label: t`Alphabetical`, value: "alphabetical" as const },
    { label: t`Custom`, value: "custom" as const },
    { label: t`Smart`, value: "smart" as const },
  ];
}
