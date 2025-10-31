import { t } from "ttag";

import { Button, Group, Icon, Select } from "metabase/ui";

interface SidebarSortControlProps {
  value: string | null;
  onChange: (value: string | null) => void;
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
        onChange={onChange}
        data={[
          { value: "last-modified", label: t`Last modified` },
          { value: "collections", label: t`Collections` },
        ]}
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
