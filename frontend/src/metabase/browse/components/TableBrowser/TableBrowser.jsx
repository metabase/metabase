import { Fragment } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { isSyncInProgress } from "metabase/lib/syncing";
import Database from "metabase/entities/databases";
import EntityItem from "metabase/components/EntityItem";
import { Icon } from "metabase/core/components/Icon";
import { Grid } from "metabase/components/Grid";
import {
  isVirtualCardId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

import { ANALYTICS_CONTEXT } from "../../constants";
import BrowseHeader from "../BrowseHeader";
import {
  TableActionLink,
  TableCard,
  TableGridItem,
  TableLink,
} from "./TableBrowser.styled";

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

const TableBrowser = ({
  database,
  tables,
  getTableUrl,
  metadata,
  dbId,
  schemaName,
  xraysEnabled,
  showSchemaInHeader = true,
}) => {
  return (
    <div>
      <BrowseHeader
        crumbs={[
          { title: t`Our data`, to: "/browse" },
          getDatabaseCrumbs(dbId),
          showSchemaInHeader && { title: schemaName },
        ]}
      />
      <Grid>
        {tables.map(table => (
          <TableGridItem key={table.id}>
            <TableCard hoverable={!isSyncInProgress(table)}>
              <TableLink
                to={
                  !isSyncInProgress(table) ? getTableUrl(table, metadata) : ""
                }
                data-metabase-event={`${ANALYTICS_CONTEXT};Table Click`}
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
      </Grid>
    </div>
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
        <TableActionLink
          to={`/auto/dashboard/table/${tableId}`}
          data-metabase-event={`${ANALYTICS_CONTEXT};Table Item;X-ray Click`}
        >
          <Icon
            name="bolt_filled"
            tooltip={t`X-ray this table`}
            color={color("warning")}
          />
        </TableActionLink>
      )}
    </Fragment>
  );
};

TableBrowserItemButtons.propTypes = itemButtonsPropTypes;

const getDatabaseCrumbs = dbId => {
  if (dbId === SAVED_QUESTIONS_VIRTUAL_DB_ID) {
    return {
      title: t`Saved Questions`,
      to: Urls.browseDatabase({ id: SAVED_QUESTIONS_VIRTUAL_DB_ID }),
    };
  } else {
    return {
      title: <Database.Link id={dbId} />,
    };
  }
};

export default TableBrowser;
