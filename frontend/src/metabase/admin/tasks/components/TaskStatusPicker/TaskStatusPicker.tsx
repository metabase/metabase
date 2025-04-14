import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TaskStatus } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TaskStatus;
  onChange: (value: TaskStatus) => void;
}

export const TaskStatusPicker = ({ value, onChange, ...props }: Props) => {
  const data = useMemo(() => getData(), []);

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
        width: 300,
      }}
      data={data}
      placeholder={t`Select status`}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};

// It intentionally is a function and not a module-level constant, so that `t` function works correctly
function getData() {
  /**
   * Using a Record, so that this gives compilation error when TaskStatus is extended,
   * so that whoever changes that type does not forget to update this function.
   */
  const statusNames: Record<
    TaskStatus,
    {
      label: string;
      value: TaskStatus;
    }
  > = {
    failed: { label: t`Failed`, value: "failed" },
    started: { label: t`Started`, value: "started" },
    success: { label: t`Success`, value: "success" },
    unknown: { label: t`Unknown`, value: "unknown" },
  };

  return Object.values(statusNames);
}
