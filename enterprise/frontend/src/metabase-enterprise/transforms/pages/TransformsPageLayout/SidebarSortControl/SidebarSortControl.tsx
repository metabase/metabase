import { t } from "ttag";

import { Button, Group, Icon, Select } from "metabase/ui";

export type SortOption = "tree" | "alphabetical" | "last-modified";

export type SortOptionData = {
  value: SortOption;
  label: string;
};

export const TRANSFORM_SORT_OPTIONS: SortOptionData[] = [
  {
    value: "tree" as const,
    get label() {
      return t`Target table`;
    },
  },
  {
    value: "alphabetical" as const,
    get label() {
      return t`Alphabetical`;
    },
  },
  {
    value: "last-modified" as const,
    get label() {
      return t`Last modified`;
    },
  },
];

export const JOB_SORT_OPTIONS: SortOptionData[] = [
  {
    value: "alphabetical" as const,
    get label() {
      return t`Alphabetical`;
    },
  },
  {
    value: "last-modified" as const,
    get label() {
      return t`Last modified`;
    },
  },
];

interface SidebarSortControlProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  onAdd?: () => void;
  addButton?: React.ReactNode;
  options: SortOptionData[];
}

export const SidebarSortControl = ({
  value,
  onChange,
  onAdd,
  addButton,
  options,
}: SidebarSortControlProps) => {
  if (!options || options.length === 0) {
    return null;
  }

  const selectData = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));

  const validValue =
    selectData.find((opt) => opt.value === value)?.value ??
    selectData[0]?.value;

  return (
    <Group gap="sm" wrap="nowrap">
      <Select
        flex={1}
        value={validValue}
        onChange={(value) => {
          if (value) {
            onChange(value as SortOption);
          }
        }}
        data={selectData}
      />
      {addButton ||
        (onAdd && (
          <Button
            p="sm"
            w={40}
            h={40}
            leftSection={<Icon name="add" size={16} />}
            onClick={onAdd}
          />
        ))}
    </Group>
  );
};
