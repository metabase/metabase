import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";

import { BrowseCard } from "metabase/browse/components/BrowseCard";
import { BrowseGrid } from "metabase/browse/components/BrowseGrid";
import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { isSyncInProgress } from "metabase/lib/syncing";
import { PLUGIN_TABLE_EDITING } from "metabase/plugins";
import { getDatabases } from "metabase/reference/selectors";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Group, Icon, Loader } from "metabase/ui";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";

import { BrowseHeaderContent } from "../../components/BrowseHeader.styled";
import { trackTableClick } from "../analytics";

import { useDatabaseCrumb } from "./useDatabaseCrumb";

const propTypes = {
  tables: PropTypes.array.isRequired,
  getTableUrl: PropTypes.func.isRequired,
  metadata: PropTypes.object,
  dbId: PropTypes.number,
  schemaName: PropTypes.string,
  xraysEnabled: PropTypes.bool,
  showSchemaInHeader: PropTypes.bool,
};

export const TableBrowser = ({
  tables,
  getTableUrl,
  metadata,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}) => {
  const databases = useSelector(getDatabases);
  const database = databases[dbId];
  const isAdmin = useSelector(getUserIsAdmin);
  const databaseCrumb = useDatabaseCrumb(dbId);
  const canEditTables =
    database &&
    isAdmin &&
    PLUGIN_TABLE_EDITING.isDatabaseTableEditingEnabled(database);

  return (
    <>
      <BrowseHeaderContent>
        <BrowserCrumbs
          crumbs={[
            { title: t`Databases`, to: "/browse/databases" },
            databaseCrumb,
            showSchemaInHeader && { title: schemaName },
          ]}
        />
      </BrowseHeaderContent>
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

TableBrowser.propTypes = propTypes;

const itemPropTypes = {
  table: PropTypes.object.isRequired,
  dbId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
  metadata: PropTypes.object,
  getTableUrl: PropTypes.func.isRequired,
  canEditTables: PropTypes.bool,
};

const TableBrowserItem = ({
  table,
  dbId,
  xraysEnabled,
  metadata,
  getTableUrl,
  canEditTables,
}) => {
  const isVirtual = isVirtualCardId(table.id);
  const isLoading = isSyncInProgress(table);

  return (
    <BrowseCard
      to={!isSyncInProgress(table) ? getTableUrl(table, metadata) : ""}
      icon="table"
      title={table.display_name || table.name}
      onClick={() => trackTableClick(table.id)}
    >
      <>
        {isLoading && <Loader size="xs" data-testid="loading-indicator" />}
        {!isLoading && !isVirtual && (
          <TableBrowserItemButtons
            tableId={table.id}
            dbId={dbId}
            xraysEnabled={xraysEnabled}
            canEditTables={canEditTables}
          />
        )}
      </>
    </BrowseCard>
  );
};

TableBrowserItem.propTypes = itemPropTypes;

const itemButtonsPropTypes = {
  tableId: PropTypes.number,
  dbId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
  canEditTables: PropTypes.bool,
};

const TableBrowserItemButtons = ({
  tableId,
  dbId,
  xraysEnabled,
  canEditTables,
}) => {
  return (
    <Box className={cx(CS.hoverChild)}>
      <Group gap="md">
        {xraysEnabled && (
          <Link to={`/auto/dashboard/table/${tableId}`}>
            <Icon
              name="bolt_filled"
              tooltip={t`X-ray this table`}
              color={color("warning")}
            />
          </Link>
        )}
        {canEditTables && (
          <Link
            to={PLUGIN_TABLE_EDITING.getTableEditUrl(tableId, dbId)}
            data-testid="edit-table-icon"
          >
            <Icon
              name="pencil"
              tooltip={t`Edit this table`}
              color={"var(--mb-color-text-medium)"}
            />
          </Link>
        )}
        <Link to={`/reference/databases/${dbId}/tables/${tableId}`}>
          <Icon
            name="reference"
            tooltip={t`Learn about this table`}
            color={color("text-medium")}
          />
        </Link>
      </Group>
    </Box>
  );
};

TableBrowserItemButtons.propTypes = itemButtonsPropTypes;

export default TableBrowser;
