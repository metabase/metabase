import PropTypes from "prop-types";
import { Fragment } from "react";
import { t } from "ttag";

import { BrowserCrumbs } from "metabase/components/BrowserCrumbs";
import EntityItem from "metabase/components/EntityItem";
import { color } from "metabase/lib/colors";
import { isSyncInProgress } from "metabase/lib/syncing";
import { Icon } from "metabase/ui";
import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";

import { BrowseHeaderContent } from "../../components/BrowseHeader.styled";
import { trackTableClick } from "../analytics";

import {
  TableActionLink,
  TableCard,
  TableGrid,
  TableGridItem,
  TableLink,
} from "./TableBrowser.styled";
import { useDatabaseCrumb } from "./useDatabaseCrumb";

const propTypes = {
  database: PropTypes.object,
  tables: PropTypes.array.isRequired,
  getTableUrl: PropTypes.func.isRequired,
  metadata: PropTypes.object,
  dbId: PropTypes.number,
  schemaName: PropTypes.string,
  xraysEnabled: PropTypes.bool,
  showSchemaInHeader: PropTypes.bool,
};

export const TableBrowser = ({
  database,
  tables,
  getTableUrl,
  metadata,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}) => {
  const databaseCrumb = useDatabaseCrumb(dbId);

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
      <TableGrid>
        {tables.map(table => (
          <TableGridItem key={table.id}>
            <TableCard hoverable={!isSyncInProgress(table)}>
              <TableLink
                to={
                  !isSyncInProgress(table) ? getTableUrl(table, metadata) : ""
                }
                onClick={() => trackTableClick(table.id)}
              >
                <TableBrowserItem
                  database={database}
                  table={table}
                  dbId={dbId}
                  xraysEnabled={xraysEnabled}
                />
              </TableLink>
            </TableCard>
          </TableGridItem>
        ))}
      </TableGrid>
    </>
  );
};

TableBrowser.propTypes = propTypes;

const itemPropTypes = {
  database: PropTypes.object,
  table: PropTypes.object.isRequired,
  dbId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
};

const TableBrowserItem = ({ database, table, dbId, xraysEnabled }) => {
  const isVirtual = isVirtualCardId(table.id);
  const isLoading = isSyncInProgress(table);

  return (
    <EntityItem
      item={table}
      name={table.display_name || table.name}
      iconName="table"
      iconColor={color("accent2")}
      loading={isLoading}
      disabled={isLoading}
      buttons={
        !isLoading &&
        !isVirtual && (
          <TableBrowserItemButtons
            tableId={table.id}
            dbId={dbId}
            xraysEnabled={xraysEnabled}
          />
        )
      }
    />
  );
};

TableBrowserItem.propTypes = itemPropTypes;

const itemButtonsPropTypes = {
  tableId: PropTypes.number,
  dbId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
};

const TableBrowserItemButtons = ({ tableId, dbId, xraysEnabled }) => {
  return (
    <Fragment>
      {xraysEnabled && (
        <TableActionLink to={`/auto/dashboard/table/${tableId}`}>
          <Icon
            name="bolt_filled"
            tooltip={t`X-ray this table`}
            color={color("warning")}
          />
        </TableActionLink>
      )}
      <TableActionLink to={`/reference/databases/${dbId}/tables/${tableId}`}>
        <Icon
          name="reference"
          tooltip={t`Learn about this table`}
          color={color("text-medium")}
        />
      </TableActionLink>
    </Fragment>
  );
};

TableBrowserItemButtons.propTypes = itemButtonsPropTypes;

export default TableBrowser;
