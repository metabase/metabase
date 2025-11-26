import type { ReactNode } from "react";
import { t } from "ttag";

import { Group, Select } from "metabase/ui";

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
  options: SortOptionData[];
  addButton?: ReactNode;
  onChange: (value: SortOption) => void;
}

export const SidebarSortControl = ({
  value,
  onChange,
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
      {addButton}
    </Group>
  );
};
