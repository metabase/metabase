import _ from "underscore";

import Tables from "./entities/tables";

// initial app actions
// 1. @INIT
// 2. metabase-api/config/middlewareRegistered
// 3. @@router/LOCATION_CHANGE
// 4. metabase/settings/REFRESH_SITE_SETTINGS/pending
// 5. metabase/settings/REFRESH_SITE_SETTINGS/fulfilled

// extra app actions in table playground:
// 1. metabase/requests/SET_REQUEST_LOADING
// 2. metabase-api/executeQuery/pending (from entityCompatibleQuery)
// 3. metabase/requests/SET_REQUEST_PROMISE
// 4. metabase-api/executeQuery/fulfilled (from entityCompatibleQuery)
// 5. metabase/entities/tables/FETCH
// 6. metabase/requests/SET_REQUEST_LOADED
// 7. metabase-api/internalSubscriptions/subscriptionsUpdated
// 8. metabase-api/queries/removeQueryResult
// 9. metabase-api/internalSubscriptions/subscriptionsUpdated

// Tables.load gives these props:
// - bulkUpdate
// - create
// - delete
// - dispatch
// - dispatchApiErrorEvent: boolean
// - error: unknown
// - fetch
// - fetchForeignKeys
// - fetchList
// - fetchMetadata
// - fetchMetadataAndForeignTables
// - fetchMetadataDeprecated
// - fetched: boolean
// - invalidateLists
// - loading: boolean
// - object: Table
// - reload
// - remove
// - setFieldOrder
// - table: Table (referentially equal to object)
// - update
// - updateProperty
// all props without specified type are functions

// Mismatching things in state:
// - requests.entities.tables.1.fetchMetadataDeprecated.queryKey
//   - missing id
//
// test fetchMetadata
// test fetchMetadataAndForeignTables

const PlaygroundBase = props => {
  console.log(props);

  return (
    <div>
      <div>loading: {props.loading ? "true" : "false"}</div>
      <div>fetched: {props.fetched ? "true" : "false"}</div>
      <div>
        dispatchApiErrorEvent: {props.dispatchApiErrorEvent ? "true" : "false"}
      </div>
      <div>table display name: {props.table.displayName()}</div>
    </div>
  );
};

const tableId = 1;

export const Playground = _.compose(
  Tables.load2({
    id: () => tableId,
    query: {
      include_sensitive_fields: true,
    },
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    selectorName: "getObjectUnfiltered",
  }),
)(PlaygroundBase);

export const PlaygroundPage = () => {
  return <Playground />;
};
