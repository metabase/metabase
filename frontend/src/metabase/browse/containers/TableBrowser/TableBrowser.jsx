import { connect } from "react-redux";
import _ from "underscore";

import Tables from "metabase/entities/tables";
import { isSyncInProgress } from "metabase/lib/syncing";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";

import TableBrowser from "../../components/TableBrowser";
import { RELOAD_INTERVAL } from "../../constants";

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
