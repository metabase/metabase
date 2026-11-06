import cx from "classnames";
import { t } from "ttag";

import { useGetDatabaseQuery } from "metabase/api";
import { BrowseCard } from "metabase/browse/components/BrowseCard";
import { BrowseGrid } from "metabase/browse/components/BrowseGrid";
import { DatabaseQuickLinksMenu } from "metabase/browse/components/DatabaseQuickLinksMenu";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_TABLE_EDITING } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, Flex, Group, Icon, Loader, Paper } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import type { DatabaseId, Table, TableId } from "metabase-types/api";

import {
  trackBrowseXRayClicked,
  trackEditDataButtonClicked,
  trackTableClick,
} from "../analytics";

import S from "./TableBrowser.module.css";
import { useDatabaseCrumb } from "./useDatabaseCrumb";

type TableBrowserProps = {
  tables: Table[];
  dbId: DatabaseId;
  schemaName?: string;
  xraysEnabled?: boolean;
  showSchemaInHeader?: boolean;
};

export const TableBrowserInner = ({
  tables,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}: TableBrowserProps) => {
  const { data: database } = useGetDatabaseQuery({ id: dbId });
  const isAdmin = useSelector(getUserIsAdmin);
  const databaseCrumb = useDatabaseCrumb(dbId);
  const canEditTables =
    !!database &&
    isAdmin &&
    PLUGIN_TABLE_EDITING.isDatabaseTableEditingEnabled(database);

  return (
    <>
      <Flex align="center" justify="space-between" pt="lg" pr="sm" pb="sm">
        <BrowserCrumbs
          crumbs={[
            { title: t`Databases`, to: "/browse/databases" },
            databaseCrumb,
            ...(showSchemaInHeader ? [{ title: schemaName }] : []),
          ]}
        />
        <DatabaseQuickLinksMenu databaseId={dbId} schemaName={schemaName} />
      </Flex>
      <BrowseGrid pt="xl">
        {tables.map((table) => (
          <TableBrowserItem
            key={table.id}
            table={table}
            dbId={dbId}
            xraysEnabled={xraysEnabled}
            canEditTables={canEditTables}
          />
        ))}
      </BrowseGrid>
    </>
  );
};

type TableBrowserItemProps = {
  table: Table;
  dbId: DatabaseId;
  xraysEnabled?: boolean;
  canEditTables?: boolean;
};

const TableBrowserItem = ({
  table,
  dbId,
  xraysEnabled,
  canEditTables,
}: TableBrowserItemProps) => {
  const tableId = table.id;
  const isLoading = isSyncInProgress(table);
  const isTableWritable = table.is_writable;
  const tableUrl = Urls.table({ id: tableId, name: table.display_name });

  return (
    <BrowseCard
      to={!isLoading ? tableUrl : ""}
      icon="table"
      title={table.display_name || table.name}
      onClick={() => trackTableClick(tableId)}
    >
      <>
        {isLoading && <Loader size="xs" />}
        {!isLoading && (
          <TableBrowserItemButtons
            tableId={tableId}
            dbId={dbId}
            xraysEnabled={xraysEnabled}
            canEditTables={canEditTables && isTableWritable}
          />
        )}
      </>
    </BrowseCard>
  );
};

type TableBrowserItemButtonsProps = {
  tableId: TableId;
  dbId: DatabaseId;
  xraysEnabled?: boolean;
  canEditTables?: boolean;
};

const TableBrowserItemButtons = ({
  tableId,
  dbId,
  xraysEnabled,
  canEditTables,
}: TableBrowserItemButtonsProps) => {
  const handleEditTableClicked = () => {
    trackEditDataButtonClicked(tableId);
  };

  return (
    <Paper p="sm" className={cx(CS.hoverChild, S.tableBrowserItemButtons)}>
      <Group gap="sm">
        {xraysEnabled && (
          <ActionIcon
            variant="subtle"
            component={Link}
            to={`/auto/dashboard/table/${tableId}`}
            size="sm"
            tooltip={t`X-ray this table`}
            aria-label={t`X-ray this table`}
            onClick={trackBrowseXRayClicked}
          >
            <Icon name="bolt" />
          </ActionIcon>
        )}
        {canEditTables && (
          <ActionIcon
            variant="subtle"
            component={Link}
            to={PLUGIN_TABLE_EDITING.getTableEditUrl(tableId, dbId)}
            onClick={handleEditTableClicked}
            size="sm"
            tooltip={t`Edit this table`}
            aria-label={t`Edit this table`}
            data-testid="edit-table-icon"
          >
            <Icon name="pencil" />
          </ActionIcon>
        )}
        <ActionIcon
          variant="subtle"
          component={Link}
          to={`/reference/databases/${dbId}/tables/${tableId}`}
          size="sm"
          tooltip={t`Learn about this table`}
          aria-label={t`Learn about this table`}
        >
          <Icon name="reference" />
        </ActionIcon>
      </Group>
    </Paper>
  );
};
