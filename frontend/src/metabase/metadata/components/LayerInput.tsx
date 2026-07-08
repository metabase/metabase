import { t } from "ttag";

import {
  DATA_LAYER_ICONS,
  getDataLayerOptions,
  isDataLayer,
} from "metabase/metadata/utils/data-layer";
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
  ...props
}: Props) => {
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
      data={getDataLayerOptions()}
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
      {...props}
    />
  );
};

function VisibilityIcon({ value }: { value: string | null }): React.ReactNode {
  if (value == null) {
    return null;
  }

  if (isDataLayer(value)) {
    return <Icon name={DATA_LAYER_ICONS[value]} />;
  }

  return null;
}
