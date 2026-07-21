(ns metabase.mcp.v2.tools.question
  "The v2 MCP `question` write tool: resolves one of three query sources — `query_handle`
   (a handle from an execute tool), inline `query` (MBQL 5), or `native` (raw SQL) — into a
   `dataset_query` map for card creation."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:unused-private-var]} ; wired into the tool handler in Task 4
(defn- resolve-query-source
  "Resolve exactly one query source to a `dataset_query` map. `query_handle` re-runs the
   save-path guards (native allowed); `query` is inline MBQL 5; `native` is built from raw SQL."
  [{:keys [query_handle query native]} session-id]
  (let [sources (cond-> []
                  query_handle (conj :query_handle)
                  query        (conj :query)
                  native       (conj :native))]
    (when-not (= 1 (count sources))
      (common/throw-teaching-error
       "Pass exactly one query source: `query_handle` (a handle from an execute tool), `query` (inline MBQL 5), or `native` ({database_id, sql})."))
    (cond
      query_handle
      (:query (common/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle))

      query
      (lib-be/normalize-query query)

      native
      (let [{:keys [database_id sql]} native
            mp (lib-be/application-database-metadata-provider database_id)]
        (lib/native-query mp sql)))))
