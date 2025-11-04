import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";

import type { ScheduleMode } from "./types";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: ScheduleMode;
  onChange: (value: ScheduleMode) => void;
}

export const ScheduleModePicker = ({
  comboboxProps,
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  const data = useMemo(() => getData(), []);

  return (
    <Select<ScheduleMode>
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={data}
      value={value}
      onChange={(value) => onChange(value)}
      {...props}
    />
  );
};

function getData(): SelectData<ScheduleMode> {
  return [
    {
      label: t`Regularly, on a schedule`,
      value: "full",
    },
    {
      label: t`Only when adding a new filter widget`,
      value: "on-demand",
    },
    {
      label: t`Never, I'll do this manually if I need to`,
      value: "none",
    },
  ];
}
