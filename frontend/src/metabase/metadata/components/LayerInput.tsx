import type { FocusEvent } from "react";
import { t } from "ttag";

import { Group, Icon, Select, SelectItem, type SelectProps } from "metabase/ui";
import type { TableDataLayer } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableDataLayer | null;
  onChange: (value: TableDataLayer | null) => void;
}

const dataLayers = ["hidden", "internal", "final"] as const;

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
        { value: "final" as const, label: t`Final` },
      ]}
      label={t`Visibility layer`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Group align="center" gap="sm" justify="center">
              <VisibilityIcon value={item.option.value} />
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      leftSection={value ? <VisibilityIcon value={value} /> : undefined}
      placeholder={t`Select visibility layer`}
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

function VisibilityIcon({ value }: { value: string | null }): React.ReactNode {
  if (value == null) {
    return null;
  }

  if (isDataLayer(value)) {
    return <Icon name={VISIBILITY_ICONS[value]} />;
  }

  return null;
}

const VISIBILITY_ICONS = {
  hidden: "eye_filled",
  internal: "database",
  final: "published",
} as const;
