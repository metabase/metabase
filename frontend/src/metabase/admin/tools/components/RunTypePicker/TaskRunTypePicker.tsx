import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
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
      placeholder={t`Filter by run type`}
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};

const getData = () => {
  const runTypeNames: { [T in TaskRunType]: { label: string; value: T } } = {
    subscription: { label: t`Subscription`, value: "subscription" },
    alert: { label: t`Alert`, value: "alert" },
    sync: { label: t`Sync`, value: "sync" },
    fingerprint: { label: t`Fingerprint`, value: "fingerprint" },
  };

  return Object.values(runTypeNames);
};
