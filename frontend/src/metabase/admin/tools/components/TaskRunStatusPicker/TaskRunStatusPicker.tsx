import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TaskRunStatus } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TaskRunStatus | null;
  onChange: (value: TaskRunStatus | null) => void;
}

export const TaskRunStatusPicker = ({ value, onChange, ...props }: Props) => {
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

const getData = () => {
  const statusNames: { [T in TaskRunStatus]: { label: string; value: T } } = {
    started: { label: t`Started`, value: "started" },
    success: { label: t`Success`, value: "success" },
    failed: { label: t`Failed`, value: "failed" },
  };

  return Object.values(statusNames);
};
