import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  Icon,
  SegmentedControl,
  type SegmentedControlItem,
  type SegmentedControlProps,
} from "metabase/ui";
import type { IconName, TableFieldOrder } from "metabase-types/api";

interface Props extends Omit<
  SegmentedControlProps<TableFieldOrder>,
  "data" | "value" | "onChange"
> {
  value: TableFieldOrder;
  onChange: (value: TableFieldOrder) => void;
}

export const FieldOrderPicker = ({ value, onChange, ...props }: Props) => {
  const data = useMemo(() => getData(), []);
  // State is managed internally for instant visual feedback
  // in case onChange handler is asynchronous.
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: TableFieldOrder) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  return (
    <SegmentedControl
      aria-label={t`Column order`}
      data={data}
      value={localValue}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData(): SegmentedControlItem<TableFieldOrder>[] {
  return [
    getIconOnlyItem({
      value: "smart",
      iconName: "sparkles",
      label: t`Auto order`,
    }),
    getIconOnlyItem({
      value: "database",
      iconName: "database",
      label: t`Database order`,
    }),
    getIconOnlyItem({
      value: "alphabetical",
      iconName: "string",
      label: t`Alphabetical order`,
    }),
    getIconOnlyItem({
      value: "custom",
      iconName: "palette",
      label: t`Custom order`,
    }),
  ];
}

interface IconOnlyItemOpts {
  value: TableFieldOrder;
  iconName: IconName;
  label: string;
}

function getIconOnlyItem({
  value,
  iconName,
  label,
}: IconOnlyItemOpts): SegmentedControlItem<TableFieldOrder> {
  return {
    value,
    ariaLabel: label,
    icon: <Icon name={iconName} tooltip={label} />,
  };
}
