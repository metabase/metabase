import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { isSyncInProgress } from "metabase/lib/syncing";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase/lib/saved-questions";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { getXraysEnabled } from "metabase/selectors/settings";
import { RELOAD_INTERVAL } from "../../constants";
import TableBrowser from "../../components/TableBrowser";

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

const getReloadInterval = (state, { database }, tables = []) => {
  if (
    database &&
    isSyncInProgress(database) &&
    tables.some(t => isSyncInProgress(t))
  ) {
    return RELOAD_INTERVAL;
  } else {
    return 0;
  }
};

const getTableUrl = (table, metadata) => {
  const metadataTable = metadata?.table(table.id);
  return metadataTable?.newQuestion().getUrl({ clean: false });
};

export default _.compose(
  Databases.load({
    id: (state, props) => getDatabaseId(props),
  }),
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
    xraysEnabled: getXraysEnabled(state),
    getTableUrl,
  })),
)(TableBrowser);
