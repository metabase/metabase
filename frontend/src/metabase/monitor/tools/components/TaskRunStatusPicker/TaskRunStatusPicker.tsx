import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
/** The outcome filter of the tasks list; "failed" covers abandoned runs too. */
export type TaskRunOutcome = "success" | "failed";

type TaskRunStatusPicker = Omit<SelectProps, "data" | "value" | "onChange"> & {
  value: TaskRunOutcome | null;
  onChange: (value: TaskRunOutcome | null) => void;
};

export const TaskRunStatusPicker = ({
  value,
  onChange,
  ...props
}: TaskRunStatusPicker) => {
  const data: SelectData<TaskRunOutcome> = [
    { label: t`Success`, value: "success" },
    { label: t`Failed`, value: "failed" },
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
      placeholder={t`Status`}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};
