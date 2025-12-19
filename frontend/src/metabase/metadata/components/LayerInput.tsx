import type { FocusEvent } from "react";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { TableDataLayer } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableDataLayer | null;
  onChange: (value: TableDataLayer | null) => void;
}

const dataLayers = ["copper", "bronze", "silver", "gold"] as const;

export const LayerInput = ({
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
      data={[
        { value: "copper" as const, label: t`Copper` },
        { value: "bronze" as const, label: t`Bronze` },
        { value: "silver" as const, label: t`Silver` },
        { value: "gold" as const, label: t`Gold` },
      ]}
      label={t`Visibility type`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Group align="center" gap="sm" justify="center">
              <Icon c={getColor(item.option.value)} name="medallion" />
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      leftSection={
        value ? <Icon c={getColor(value)} name="medallion" /> : undefined
      }
      placeholder={t`Select a visibility type`}
      value={value}
      onChange={(value) => onChange(value)}
      onFocus={handleFocus}
      {...props}
    />
  );
};

function isDataLayer(value: string): value is TableDataLayer {
  return dataLayers.some((layer) => layer === value);
}

function getColor(value: TableDataLayer | string): ColorName {
  if (isDataLayer(value)) {
    return value;
  }
  return "copper";
}
