import type { FocusEvent } from "react";
import { t } from "ttag";

import { getEntityIcon } from "metabase/detail-view/utils";
import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: Table["entity_type"];
  onChange: (value: Table["entity_type"]) => void;
}

export const EntityTypeInput = ({
  comboboxProps,
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
    onFocus?.(event);
  };

  const entities = [
    { value: "entity/GenericTable", label: t`Generic` },
    { value: "entity/UserTable", label: t`Person` },
    { value: "entity/CompanyTable", label: t`Company` },
    { value: "entity/TransactionTable", label: t`Transaction` },
    { value: "entity/ProductTable", label: t`Product` },
    { value: "entity/SubscriptionTable", label: t`Subscription` },
    { value: "entity/EventTable", label: t`Event` },
  ];

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={entities}
      label={t`Entity type`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Group align="center" gap="sm" justify="center">
              <Icon name={getEntityIcon(item.option.value)} />
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      leftSection={value ? <Icon name={getEntityIcon(value)} /> : undefined}
      placeholder={t`Select entity type`}
      value={value}
      onChange={(value) => onChange(value)}
      onFocus={handleFocus}
      {...props}
    />
  );
};
