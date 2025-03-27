import { match } from "ts-pattern";
import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

interface Props {
  value: TableFieldOrder;
  onChange: (value: TableFieldOrder) => void;
}

/**
 * Using a Record, so that this gives compilation error when TableFieldOrder is extended,
 * so that whoever changes that type does not forget to update this component.
 */
const OPTIONS: Record<TableFieldOrder, TableFieldOrder> = {
  alphabetical: "alphabetical",
  custom: "custom",
  database: "database",
  smart: "smart",
};

export const FieldOrderDropdown = ({ value, onChange }: Props) => {
  return (
    // TODO: use Select/Combobox to highlight current value
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          aria-label={t`Sort`}
          leftSection={<Icon name="sort_arrows" />}
          p={0}
          variant="subtle"
        >
          {getFieldOrderLabel(value)}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        {Object.values(OPTIONS).map((fieldOrder) => (
          <Menu.Item key={fieldOrder} onClick={() => onChange(fieldOrder)}>
            {getFieldOrderLabel(fieldOrder)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

const getFieldOrderLabel = (fieldOrder: TableFieldOrder) => {
  return match(fieldOrder)
    .with("alphabetical", () => t`Alphabetical`)
    .with("custom", () => t`Custom`)
    .with("database", () => t`Database`)
    .with("smart", () => t`Smart`)
    .exhaustive();
};
