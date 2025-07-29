import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Flex, Group, Text } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import type { Table } from "metabase-types/api";

import { Nav } from "../components/Nav";

interface DetailViewHeaderProps {
  table: Table;
  rowId?: string | number;
  rowName?: ReactNode;
  isEdit: boolean;
  canOpenPreviousItem: boolean;
  canOpenNextItem: boolean;
  onPreviousItemClick: () => void;
  onNextItemClick: () => void;
  onEditClick: () => void;
  onCloseClick: () => void;
  onSaveClick?: () => void;
}

export function DetailViewHeader({
  table,
  rowId,
  rowName,
  isEdit,
  canOpenPreviousItem,
  canOpenNextItem,
  onPreviousItemClick,
  onNextItemClick,
  onEditClick,
  onCloseClick,
  onSaveClick,
}: DetailViewHeaderProps & { table: any }): JSX.Element {
  return (
    <Nav rowId={rowId} rowName={rowName} table={table}>
      <Group gap="sm">
        <Icon name="table" size={24} c="brand" />
        <Text component={Link} to={`/table/${table.id}`} size="lg" fw={600}>
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
          <>
            <Button variant="filled" onClick={onSaveClick}>{t`Save`}</Button>
            <Button variant="subtle" onClick={onCloseClick}>{t`Cancel`}</Button>
          </>
        ) : (
          <Button
            variant="subtle"
            leftSection={<Icon name="pencil" />}
            onClick={onEditClick}
            size="compact-xs"
          />
        )}
      </Flex>
    </Nav>
  );
}
