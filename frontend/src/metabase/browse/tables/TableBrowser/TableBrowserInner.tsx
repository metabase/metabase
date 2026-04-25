import cx from "classnames";
import { t } from "ttag";

import { BrowseCard } from "metabase/browse/components/BrowseCard";
import { BrowseGrid } from "metabase/browse/components/BrowseGrid";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { PLUGIN_TABLE_EDITING } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getShallowDatabases as getDatabases } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Flex, Group, Icon, Loader, Paper } from "metabase/ui";
import { isSyncInProgress } from "metabase/utils/syncing";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  ConcreteTableId,
  Database,
  DatabaseId,
  Table,
} from "metabase-types/api";

import {
  trackBrowseXRayClicked,
  trackEditDataButtonClicked,
  trackTableClick,
} from "../analytics";

import S from "./TableBrowser.module.css";
import { useDatabaseCrumb } from "./useDatabaseCrumb";

type GetTableUrl = (table: Table, metadata?: Metadata) => string;

type TableBrowserProps = {
  tables: Table[];
  getTableUrl: GetTableUrl;
  metadata?: Metadata;
  dbId: DatabaseId;
  schemaName?: string;
  xraysEnabled?: boolean;
  showSchemaInHeader?: boolean;
};

export const TableBrowserInner = ({
  tables,
  getTableUrl,
  metadata,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}: TableBrowserProps) => {
  const databases = useSelector(getDatabases);
  const database = databases[dbId];
  const isAdmin = useSelector(getUserIsAdmin);
  const databaseCrumb = useDatabaseCrumb(dbId);
  const canEditTables =
    !!database &&
    isAdmin &&
    PLUGIN_TABLE_EDITING.isDatabaseTableEditingEnabled(database as Database);

  return (
    <>
      <Flex align="center" pt="md" pr="sm" pb="sm">
        <BrowserCrumbs
          crumbs={[
            { title: t`Databases`, to: "/browse/databases" },
            databaseCrumb,
            ...(showSchemaInHeader ? [{ title: schemaName }] : []),
          ]}
        />
      </Flex>
      <BrowseGrid pt="lg">
        {tables.map((table) => (
          <TableBrowserItem
            key={table.id}
            table={table}
            dbId={dbId}
            getTableUrl={getTableUrl}
            xraysEnabled={xraysEnabled}
            metadata={metadata}
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
  metadata?: Metadata;
  getTableUrl: GetTableUrl;
  canEditTables?: boolean;
};

const TableBrowserItem = ({
  table,
  dbId,
  xraysEnabled,
  metadata,
  getTableUrl,
  canEditTables,
}: TableBrowserItemProps) => {
  const isVirtual = isVirtualCardId(table.id);
  const isLoading = isSyncInProgress(table);
  const isTableWritable = table.is_writable;

  return (
    <BrowseCard
      to={!isSyncInProgress(table) ? getTableUrl(table, metadata) : ""}
      icon="table"
      title={table.display_name || table.name}
      onClick={() => trackTableClick(table.id as ConcreteTableId)}
    >
      <>
        {isLoading && <Loader size="xs" data-testid="loading-indicator" />}
        {!isLoading && !isVirtual && (
          <TableBrowserItemButtons
            tableId={table.id as ConcreteTableId}
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
  tableId: ConcreteTableId;
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
            component={Link}
            to={`/auto/dashboard/table/${tableId}`}
            size="sm"
            tooltip={t`X-ray this table`}
            color="warning"
            aria-label={t`X-ray this table`}
            onClick={trackBrowseXRayClicked}
          >
            <Icon name="bolt" />
          </ActionIcon>
        )}
        {canEditTables && (
          <ActionIcon
            component={Link}
            to={PLUGIN_TABLE_EDITING.getTableEditUrl(tableId, dbId)}
            onClick={handleEditTableClicked}
            size="sm"
            tooltip={t`Edit this table`}
            color="text-secondary"
            aria-label={t`Edit this table`}
            data-testid="edit-table-icon"
          >
            <Icon name="pencil" />
          </ActionIcon>
        )}
        <ActionIcon
          component={Link}
          to={`/reference/databases/${dbId}/tables/${tableId}`}
          size="sm"
          tooltip={t`Learn about this table`}
          color="text-secondary"
          aria-label={t`Learn about this table`}
        >
          <Icon name="reference" />
        </ActionIcon>
      </Group>
    </Paper>
  );
};
