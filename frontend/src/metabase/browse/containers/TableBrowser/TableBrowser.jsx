import { connect } from "react-redux";
import _ from "underscore";
import * as Urls from "metabase/lib/urls";
import { isSyncInProgress } from "metabase/lib/syncing";
import Table from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { getXraysEnabled } from "metabase/selectors/settings";
import { RELOAD_INTERVAL } from "../../constants";
import TableBrowser from "../../components/TableBrowser";

const getDatabaseId = props => {
  const { params } = props;
  const dbId =
    parseInt(props.dbId) ||
    parseInt(params.dbId) ||
    Urls.extractEntityId(params.slug);

  return Number.isSafeInteger(dbId) ? dbId : undefined;
};

const getSchemaName = props => {
  return props.schemaName || props.params.schemaName;
};

const getReloadInterval = (state, props, tables = []) => {
  return tables.some(t => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0;
};

const getTableUrl = (table, metadata) => {
  const metadataTable = metadata?.table(table.id);
  return metadataTable?.newQuestion().getUrl({ clean: false });
};

export default _.compose(
  Table.loadList({
    query: (state, props) => ({
      dbId: getDatabaseId(props),
      schemaName: getSchemaName(props),
    }),
    reloadInterval: getReloadInterval,
  }),
  connect((state, props) => ({
    dbId: getDatabaseId(props),
    schemaName: getSchemaName(props),
    metadata: getMetadata(state),
    xraysEnabled: getXraysEnabled(state),
    getTableUrl,
  })),
)(TableBrowser);
