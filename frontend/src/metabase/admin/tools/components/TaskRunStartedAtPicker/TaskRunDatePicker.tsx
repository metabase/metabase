import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { SelectData } from "metabase/ui/components/inputs/Select/Select";
import type { TaskRunDateFilterOption } from "metabase-types/api";

type TaskRunDatePickerProps = Omit<
  SelectProps,
  "data" | "value" | "onChange"
> & {
  value: TaskRunDateFilterOption | null;
  onChange: (value: TaskRunDateFilterOption | null) => void;
};

export const TaskRunDatePicker = ({
  value,
  onChange,
  ...props
}: TaskRunDatePickerProps) => {
  /**
   * Using a simple version of TimeFilterWidget here in order to align with a design of admin page.
   * That means no custom date ranges.
   */
  const data: SelectData<TaskRunDateFilterOption> = [
    { label: t`Today`, value: "thisday" },
    { label: t`Yesterday`, value: "past1days~" },
    { label: t`Previous week`, value: "past1weeks~" },
    { label: t`Previous 7 days`, value: "past7days~" },
    { label: t`Previous 30 days`, value: "past30days~" },
    { label: t`Previous month`, value: "past1months~" },
    { label: t`Previous 3 months`, value: "past3months~" },
    { label: t`Previous 12 months`, value: "past12months~" },
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
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};
