import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateTableComponentSettingsMutation } from "metabase/api";
import { Box, Flex, Group, Tooltip } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValue,
  Table,
} from "metabase-types/api";

import { Nav } from "../components/Nav";

interface DetailViewHeaderProps {
  table: Table;
  row: RowValue[];
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  rowId?: string | number;
  rowName?: ReactNode;
  isEdit: boolean;
  canOpenPreviousItem: boolean;
  canOpenNextItem: boolean;
  onPreviousItemClick: () => void;
  onNextItemClick: () => void;
  onEditClick: () => void;
  onCloseClick: () => void;
  onSaveClick: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function DetailViewHeader({
  table,
  row,
  rowId,
  rowName,
  isEdit,
  columns,
  sections,
  canOpenPreviousItem,
  canOpenNextItem,
  onPreviousItemClick,
  onNextItemClick,
  onEditClick,
  onCancel,
  onSubmit,
}: DetailViewHeaderProps & { table: any }): JSX.Element {
  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  return (
    <Nav
      columns={columns}
      sections={sections}
      row={row}
      rowId={rowId}
      rowName={rowName}
      table={table}
    >
      <Flex align="center" gap="md">
        {(canOpenPreviousItem || canOpenNextItem) && (
          <>
            <Group gap="sm">
              <Tooltip disabled={!canOpenPreviousItem} label={t`Previous row`}>
                <Button
                  w={32}
                  h={32}
                  c="text-dark"
                  variant="subtle"
                  disabled={!canOpenPreviousItem}
                  onClick={onPreviousItemClick}
                  leftSection={<Icon name="chevronup" />}
                  style={{
                    opacity: !canOpenPreviousItem ? 0.5 : 1,
                  }}
                />
              </Tooltip>

              <Tooltip disabled={!canOpenNextItem} label={t`Next row`}>
                <Button
                  w={32}
                  h={32}
                  c="text-dark"
                  variant="subtle"
                  disabled={!canOpenNextItem}
                  onClick={onNextItemClick}
                  leftSection={<Icon name="chevrondown" />}
                  style={{
                    opacity: !canOpenNextItem ? 0.5 : 1,
                  }}
                />
              </Tooltip>
            </Group>

            <Box h={20} w={1} bg="var(--border-color)" />
          </>
        )}

        <Group gap={0}>
          {!isEdit ? (
            <Button
              h={32}
              c="text-dark"
              variant="subtle"
              disabled={isEdit}
              leftSection={<Icon name="gear" />}
              onClick={onEditClick}
              style={{
                opacity: isEdit ? 0.5 : 1,
                padding: "0 0.5rem",
              }}
            >
              {t`Display settings`}
            </Button>
          ) : (
            <Group gap="xs" justify="space-between">
              <Tooltip
                label={t`PLEASE IGNORE THIS BUTTON. It resets settings to default. Useful when settings schema changes.`}
              >
                <Button
                  w={30}
                  h={30}
                  c="text-dark"
                  variant="subtle"
                  leftSection={<Icon name="refresh" />}
                  onClick={() => {
                    if (
                      window.confirm("The change will persist. Are you sure?")
                    ) {
                      updateTableComponentSettings({
                        id: table.id,
                        component_settings: null,
                      });
                    }
                  }}
                />
              </Tooltip>
              <Button size="xs" variant="subtle" onClick={onCancel}>
                {t`Cancel`}
              </Button>

              <Button
                size="xs"
                type="submit"
                variant="filled"
                onClick={onSubmit}
              >
                {t`Save`}
              </Button>
            </Group>
          )}
        </Group>
      </Flex>
    </Nav>
  );
}
