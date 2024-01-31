import { Fragment } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { isSyncInProgress } from "metabase/lib/syncing";
import Database from "metabase/entities/databases";
import EntityItem from "metabase/components/EntityItem";
import { Icon } from "metabase/ui";
import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import {
  isVirtualCardId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/urls";
import { RELOAD_INTERVAL } from "../../constants";
import { BrowseHeaderContent } from "../BrowseHeader.styled";
import {
  TableActionLink,
  TableCard,
  TableGrid,
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
    <>
      <BrowseHeaderContent>
        <BrowserCrumbs
          crumbs={[
            { title: t`Databases`, to: "/browse/databases" },
            getDatabaseCrumbs(dbId),
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
  table: PropTypes.object.isRequired,
  dbId: PropTypes.number,
  xraysEnabled: PropTypes.bool,
};

const TableBrowserItem = ({ table, dbId, xraysEnabled }) => {
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

const getDatabaseId = (props, { includeVirtual } = {}) => {
  const { params } = props;
  const dbId =
    parseInt(props.dbId) ||
    parseInt(params.dbId) ||
    Urls.extractEntityId(params.slug);

  if (!Number.isSafeInteger(dbId)) {
    return undefined;
  } else if (dbId === SAVED_QUESTIONS_VIRTUAL_DB_ID && !includeVirtual) {
    return undefined;
  } else {
    return dbId;
  }
};

const getSchemaName = props => {
  return props.schemaName || props.params.schemaName;
};

const getReloadInterval = (_state, _props, tables = []) =>
  tables.some(t => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0;

const getTableUrl = (table, metadata) => {
  const metadataTable = metadata?.table(table.id);
  return ML_Urls.getUrl(metadataTable?.newQuestion(), { clean: false });
};

export default _.compose(
  Tables.loadList({
    query: (state, props) => ({
      dbId: getDatabaseId(props, { includeVirtual: true }),
      schemaName: getSchemaName(props),
    }),
    reloadInterval: getReloadInterval,
  }),
  connect((state, props) => ({
    dbId: getDatabaseId(props, { includeVirtual: true }),
    schemaName: getSchemaName(props),
    metadata: getMetadata(state),
    xraysEnabled: getSetting(state, "enable-xrays"),
    getTableUrl,
  })),
)(TableBrowser);
