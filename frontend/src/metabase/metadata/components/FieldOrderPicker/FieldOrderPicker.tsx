import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { SegmentedControl, type SegmentedControlProps } from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

import S from "./FieldOrderPicker.module.css";
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
      className={S.root}
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
      label: <Label icon="sparkles" tooltip={t`Auto order`} />,
    },
    {
      value: "database" as const,
      label: <Label icon="database" tooltip={t`Database order`} />,
    },
    {
      value: "alphabetical" as const,
      label: <Label icon="string" tooltip={t`Alphabetical order`} />,
    },
    {
      value: "custom" as const,
      label: <Label icon="palette" tooltip={t`Custom order`} />,
    },
  ];
}
