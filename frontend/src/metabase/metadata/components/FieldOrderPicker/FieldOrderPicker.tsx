import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  Flex,
  Icon,
  SegmentedControl,
  type SegmentedControlProps,
  Tooltip,
} from "metabase/ui";
import type { TableFieldOrder } from "metabase-types/api";

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
      label: (
        <Tooltip label={t`Smart`}>
          <Flex align="center" justify="center" w={24}>
            <Icon name="sparkles" />
          </Flex>
        </Tooltip>
      ),
    },
    {
      value: "database" as const,
      label: (
        <Tooltip label={t`Database`}>
          <Flex align="center" justify="center" w={24}>
            <Icon name="database" />
          </Flex>
        </Tooltip>
      ),
    },
    {
      value: "alphabetical" as const,
      label: (
        <Tooltip label={t`Alphabetical`}>
          <Flex align="center" justify="center" w={24}>
            <Icon name="string" />
          </Flex>
        </Tooltip>
      ),
    },
    {
      value: "custom" as const,
      label: (
        <Tooltip label={t`Custom`}>
          <Flex align="center" justify="center" w={24}>
            <Icon name="palette" />
          </Flex>
        </Tooltip>
      ),
    },
  ];
}
