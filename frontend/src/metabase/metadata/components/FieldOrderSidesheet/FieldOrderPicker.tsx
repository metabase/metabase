import { match } from "ts-pattern";
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

const DATA = getData();

export const FieldOrderPicker = ({ value, onChange, ...props }: Props) => {
  const combobox = useCombobox();

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
      data={DATA}
      fw="bold"
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={t`Select a currency type`}
      inputContainer={() => (
        <Combobox.Target>
          <Button
            aria-label={t`Sort`}
            leftSection={<Icon name="sort_arrows" />}
            p={0}
            variant="subtle"
            onClick={() => combobox.toggleDropdown()}
          >
            {getFieldOrderLabel(value)}
          </Button>
        </Combobox.Target>
      )}
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData() {
  /**
   * Using a Record, so that this gives compilation error when TableFieldOrder is extended,
   * so that whoever changes that type does not forget to update this component.
   */
  const options: Record<TableFieldOrder, TableFieldOrder> = {
    alphabetical: "alphabetical",
    custom: "custom",
    database: "database",
    smart: "smart",
  };

  return Object.values(options).map((fieldOrder) => ({
    label: getFieldOrderLabel(fieldOrder),
    value: fieldOrder,
  }));
}

function getFieldOrderLabel(fieldOrder: TableFieldOrder) {
  return match(fieldOrder)
    .with("alphabetical", () => t`Alphabetical`)
    .with("custom", () => t`Custom`)
    .with("database", () => t`Database`)
    .with("smart", () => t`Smart`)
    .exhaustive();
}
