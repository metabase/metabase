import type { FocusEvent } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { TableDataLayer } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableDataLayer | null;
  onChange: (value: TableDataLayer | null) => void;
}

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
        { value: "copper", label: t`Copper` },
        { value: "bronze", label: t`Bronze` },
        { value: "silver", label: t`Silver` },
        { value: "gold", label: t`Gold` },
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
      placeholder={t`Select a layer`}
      value={value}
      onChange={(value) => onChange(value)}
      onFocus={handleFocus}
      {...props}
    />
  );
};

// TODO: remove `string | ` part.
function getColor(value: string | TableDataLayer): string {
  return match(value)
    .with("copper", () => {
      return "#B87333";
    })
    .with("bronze", () => {
      return "#CD7F32";
    })
    .with("silver", () => {
      return "#C0C0C0";
    })
    .with("gold", () => {
      return "#FFD700";
    })
    .otherwise(() => {
      return "#B87333";
    });
}
