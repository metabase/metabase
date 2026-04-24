import _ from "underscore";

import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, Table } from "metabase-types/api";

import { RELOAD_INTERVAL } from "../../constants";

import { TableBrowserInner } from "./TableBrowserInner";

type RouteParams = {
  dbId?: string;
  schemaName?: string;
  slug?: string;
};

type TableBrowserContainerProps = {
  dbId?: DatabaseId | string;
  schemaName?: string;
  params?: RouteParams;
};

const getDatabaseId = (
  props: TableBrowserContainerProps,
  { includeVirtual = false }: { includeVirtual?: boolean } = {},
): DatabaseId | undefined => {
  const { params } = props;
  const dbId =
    parseInt(String(props.dbId)) ||
    parseInt(String(params?.dbId)) ||
    Urls.extractEntityId(params?.slug);

  if (!Number.isSafeInteger(dbId)) {
    return undefined;
  } else if (dbId === SAVED_QUESTIONS_VIRTUAL_DB_ID && !includeVirtual) {
    return undefined;
  } else {
    return dbId as DatabaseId;
  }
};

const getSchemaName = (props: TableBrowserContainerProps): string | undefined =>
  props.schemaName ?? props.params?.schemaName;

const getReloadInterval = (
  _state: State,
  _props: TableBrowserContainerProps,
  tables: Table[] = [],
): number => (tables.some((t) => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0);

export const getTableUrl = (table: Table, metadata?: Metadata): string => {
  const metadataTable = metadata?.table(table.id);
  const question = metadataTable?.newQuestion();
  return question ? Urls.question(question) : "";
};

export const TableBrowser = _.compose(
  Tables.loadList({
    query: (_state: State, props: TableBrowserContainerProps) => ({
      dbId: getDatabaseId(props, { includeVirtual: true }),
      schemaName: getSchemaName(props),
    }),
    reloadInterval: getReloadInterval,
  }),
  connect((state: State, props: TableBrowserContainerProps) => ({
    dbId: getDatabaseId(props, { includeVirtual: true }),
    schemaName: getSchemaName(props),
    metadata: getMetadata(state),
    xraysEnabled: getSetting(state, "enable-xrays"),
    getTableUrl,
  })),
)(TableBrowserInner);
