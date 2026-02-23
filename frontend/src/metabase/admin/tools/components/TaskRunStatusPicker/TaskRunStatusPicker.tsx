import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type { TaskRunStatus } from "metabase-types/api";

type TaskRunStatusPicker = Omit<SelectProps, "data" | "value" | "onChange"> & {
  value: TaskRunStatus | null;
  onChange: (value: TaskRunStatus | null) => void;
};

export const TaskRunStatusPicker = ({
  value,
  onChange,
  ...props
}: TaskRunStatusPicker) => {
  const data: SelectData<TaskRunStatus> = [
    { label: t`Started`, value: "started" },
    { label: t`Success`, value: "success" },
    { label: t`Failed`, value: "failed" },
    { label: t`Abandoned`, value: "abandoned" },
  ];

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
