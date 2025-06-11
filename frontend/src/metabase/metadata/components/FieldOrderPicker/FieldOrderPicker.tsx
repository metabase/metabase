import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { SegmentedControl, type SegmentedControlProps } from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

import { Label } from "./Label";

interface Props
  extends Omit<
    SegmentedControlProps<TableFieldOrder>,
    "data" | "value" | "onChange"
  > {
  value: TableFieldOrder;
  onChange: (value: TableFieldOrder) => void;
}

export const FieldOrderPicker = ({ value, onChange, ...props }: Props) => {
  const data = useMemo(() => getData(), []);
  // State is managed internally for instant visual feedback, since the value prop
  // will only update after API request is completed.
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
      data={data}
      size="sm"
      value={localValue}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData() {
  return [
    {
      value: "smart" as const,
      label: <Label icon="sparkles" tooltip={t`Smart`} />,
    },
    {
      value: "database" as const,
      label: <Label icon="database" tooltip={t`Database`} />,
    },
    {
      value: "alphabetical" as const,
      label: <Label icon="string" tooltip={t`Alphabetical`} />,
    },
    {
      value: "custom" as const,
      label: <Label icon="palette" tooltip={t`Custom`} />,
    },
  ];
}
