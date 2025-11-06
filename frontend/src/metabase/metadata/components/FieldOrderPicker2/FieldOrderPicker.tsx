import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { SegmentedControl, type SegmentedControlProps } from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

import S from "./FieldOrderPicker.module.css";
import { Label } from "./Label";
import { Ellipsified } from "metabase/common/components/Ellipsified";

interface Props
  extends Omit<
    SegmentedControlProps<TableFieldOrder>,
    "data" | "value" | "onChange"
  > {
  value: TableFieldOrder;
  onChange: (value: TableFieldOrder) => void;
}

export const FieldOrderPicker2 = ({ value, onChange, ...props }: Props) => {
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
      classNames={{
        label: S.label,
        control: S.control,
      }}
      data={data}
      size="sm"
      value={localValue}
      w="100%"
      onChange={handleChange}
      {...props}
    />
  );
};

function getData() {
  return [
    {
      value: "smart" as const,
      label: <Ellipsified tooltip={t`Auto order`}>{t`Auto`}</Ellipsified>,
    },
    {
      value: "database" as const,
      label: (
        <Ellipsified tooltip={t`Database order`}>{`DB order`}</Ellipsified>
      ),
    },
    {
      value: "alphabetical" as const,
      label: (
        <Ellipsified
          tooltip={t`Alphabetical order`}
        >{t`Alphabetical`}</Ellipsified>
      ),
    },
    {
      value: "custom" as const,
      label: <Ellipsified tooltip={t`Custom order`}>{t`Custom`}</Ellipsified>,
    },
  ];
}
