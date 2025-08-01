import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { isSyncInProgress } from "metabase/lib/syncing";
import { getUrl } from "metabase/metadata/pages/DataModel/utils";
import { Flex, Menu, Tooltip } from "metabase/ui/components";
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
      <Flex align="center" gap="sm">
        {(canOpenPreviousItem || canOpenNextItem) && (
          <>
            <Tooltip disabled={!canOpenPreviousItem} label={t`Previous row`}>
              <Button
                disabled={!canOpenPreviousItem}
                onClick={onPreviousItemClick}
                leftSection={<Icon name="chevronup" />}
              />
            </Tooltip>

            <Tooltip disabled={!canOpenNextItem} label={t`Next row`}>
              <Button
                disabled={!canOpenNextItem}
                onClick={onNextItemClick}
                leftSection={<Icon name="chevrondown" />}
              />
            </Tooltip>
          </>
        )}

        {!isEdit && (
          <Button leftSection={<Icon name="gear" />} onClick={onEditClick}>
            {t`Display settings`}
          </Button>
        )}

        {/* {!isSyncInProgress(table) && (
          <Menu position="bottom-end">
            <Menu.Target>
              <Tooltip label={t`More`}>
                <Button leftSection={<Icon name="ellipsis" />} />
              </Tooltip>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="reference" />}
                component={Link}
                to={`/reference/databases/${table.db_id}/tables/${table.id}`}
              >
                {t`Learn about this table`}
              </Menu.Item>

              <Menu.Item
                leftSection={<Icon name="table2" />}
                component={Link}
                to={getUrl({
                  databaseId: table.db_id,
                  schemaName: table.schema,
                  tableId: table.id,
                  fieldId: undefined,
                })}
              >
                {t`Edit table metadata`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )} */}
      </Flex>
    </Nav>
  );
}
