import { useMemo } from "react";
import { t } from "ttag";

import { Select, type SelectOption, type SelectProps } from "metabase/ui";

import type { ScheduleMode } from "./types";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: ScheduleMode;
  onChange: (value: ScheduleMode) => void;
  hasFullUsedMode: boolean;
}

export const ScheduleModePicker = ({
  comboboxProps,
  value,
  onChange,
  hasFullUsedMode,
  onFocus,
  ...props
}: Props) => {
  const data = useMemo(() => getData(hasFullUsedMode), [hasFullUsedMode]);

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

function getData(hasFullUsedMode: boolean): SelectOption<ScheduleMode>[] {
  const options: SelectOption<ScheduleMode>[] = [
    {
      label: t`Regularly, on a schedule`,
      value: "full",
    },
    {
      label: t`Regularly, on a schedule, only for filters people used`,
      value: "full-used",
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

  return options.filter(
    ({ value }) => hasFullUsedMode || value !== "full-used",
  );
}
