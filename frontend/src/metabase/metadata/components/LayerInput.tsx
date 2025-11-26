import type { FocusEvent } from "react";
import { t } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { TableDataLayer } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableDataLayer | null;
  onChange: (value: TableDataLayer | null) => void;
}

const dataLayers = ["hidden", "internal", "published"] as const;

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
        { value: "hidden" as const, label: t`Hidden` },
        { value: "internal" as const, label: t`Internal` },
        { value: "published" as const, label: t`Published` },
      ]}
      label={t`Visibility type`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Group align="center" gap="sm" justify="center">
              <Icon c={getColor(item.option.value)} name="eye_filled" />
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      leftSection={
        value ? <Icon c={getColor(value)} name="eye_filled" /> : undefined
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
  // todo fixme
  return "copper";
}
