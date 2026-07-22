import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TaskStatus } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TaskStatus | null;
  onChange: (value: TaskStatus | null) => void;
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
      clearable
      data={data}
      placeholder={t`Filter by status`}
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
  const statusNames: { [T in TaskStatus]: { label: string; value: T } } = {
    failed: { label: t`Failed`, value: "failed" },
    started: { label: t`Started`, value: "started" },
    success: { label: t`Success`, value: "success" },
    unknown: { label: t`Unknown`, value: "unknown" },
  };

  return Object.values(statusNames);
}
