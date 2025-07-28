import { Link } from "react-router";
import { t } from "ttag";

import { Flex, Group, Text } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import type { Table } from "metabase-types/api";

interface DetailViewHeaderProps {
  table: Table;
  isEdit: boolean;
  canOpenPreviousItem: boolean;
  canOpenNextItem: boolean;
  onPreviousItemClick: () => void;
  onNextItemClick: () => void;
  onEditClick: () => void;
  onCloseClick: () => void;
}

export function DetailViewHeader({
  table,
  isEdit,
  canOpenPreviousItem,
  canOpenNextItem,
  onPreviousItemClick,
  onNextItemClick,
  onEditClick,
  onCloseClick,
}: DetailViewHeaderProps & { table: any }): JSX.Element {
  return (
    <Flex align="center" justify="space-between">
      <Group gap="sm">
        <Icon name="table" size={24} c="brand" />
        <Text size="lg" fw={600}>
          {table.display_name}
        </Text>
      </Group>
      <Flex align="center" gap="sm">
        {(canOpenPreviousItem || canOpenNextItem) && (
          <>
            <Button
              variant="subtle"
              disabled={!canOpenPreviousItem}
              onClick={onPreviousItemClick}
              leftSection={<Icon name="chevronup" />}
              size="compact-xs"
            />
            <Button
              variant="subtle"
              disabled={!canOpenNextItem}
              onClick={onNextItemClick}
              leftSection={<Icon name="chevrondown" />}
              size="compact-xs"
            />
          </>
        )}
        <Button
          variant="subtle"
          component={Link}
          to={`/reference/databases/${table.db_id}/tables/${table.id}`}
          leftSection={<Icon name="link" />}
          size="compact-xs"
        />
        {isEdit ? (
          <Button variant="subtle" onClick={onCloseClick}>{t`Cancel`}</Button>
        ) : (
          <Button
            variant="subtle"
            leftSection={<Icon name="pencil" />}
            onClick={onEditClick}
            size="compact-xs"
          />
        )}
      </Flex>
    </Flex>
  );
}
