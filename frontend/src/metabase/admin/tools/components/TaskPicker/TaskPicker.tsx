import { useMemo } from "react";
import { t } from "ttag";

import { useListUniqueTasksQuery } from "metabase/api";
import { Select, type SelectProps } from "metabase/ui";
import type { Task } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: Task["task"] | null;
  onChange: (value: Task["task"] | null) => void;
}

export const TaskPicker = ({ value, onChange, ...props }: Props) => {
  const { data: uniqueTasks } = useListUniqueTasksQuery();
  const data = useMemo(() => getData(uniqueTasks), [uniqueTasks]);

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
      placeholder={t`Filter by task`}
      searchable
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};

function getData(uniqueTasks?: string[]) {
  if (!uniqueTasks) {
    return [];
  }

  return uniqueTasks.map((task) => ({ label: task, value: task }));
}
