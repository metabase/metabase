import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type { TaskRunType } from "metabase-types/api";

type TaskRunTypePickerProps = Omit<
  SelectProps,
  "data" | "value" | "onChange"
> & {
  value: TaskRunType | null;
  onChange: (value: TaskRunType | null) => void;
};

export const TaskRunTypePicker = ({
  value,
  onChange,
  ...props
}: TaskRunTypePickerProps) => {
  const data: SelectData<TaskRunType> = [
    { label: t`Subscription`, value: "subscription" },
    { label: t`Alert`, value: "alert" },
    { label: t`Sync`, value: "sync" },
    { label: t`Fingerprint`, value: "fingerprint" },
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
      placeholder={t`Filter by run type`}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};
