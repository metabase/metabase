import { t } from "ttag";

import { Button, Group, Icon, Select } from "metabase/ui";

export type SortOption = "tree" | "alphabetical" | "last-modified";

type SortOptionData = {
  value: SortOption;
  label: string;
};

const SORT_OPTIONS: SortOptionData[] = [
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

interface SidebarSortControlProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  onAdd?: () => void;
}

export const SidebarSortControl = ({
  value,
  onChange,
  onAdd,
}: SidebarSortControlProps) => {
  return (
    <Group gap="sm" wrap="nowrap">
      <Select
        size="sm"
        flex={1}
        value={value}
        onChange={(value) => onChange(value as SortOption)}
        data={SORT_OPTIONS}
      />
      {onAdd && (
        <Button
          p="sm"
          w={36}
          h={36}
          leftSection={<Icon name="add" size={16} />}
          onClick={onAdd}
        />
      )}
    </Group>
  );
};
