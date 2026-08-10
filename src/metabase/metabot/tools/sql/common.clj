(ns metabase.metabot.tools.sql.common
  "Namespace that aggregates functionality common to tools sql namespaces.

  Those are:
  - `metabot.tools.create-sql-query`,
  - `metabot.tools.edit-sql-query`,
  - `metabot.tools.replace-sql-query`.

  Each of those namespaces define an _operation_:
  - `create-sql-query`,
  - `edit-sql-query`,
  - `replace-sql-query`."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]))

(mr/def ::action-result
  "Each of the _operations_ performs an _action_ manipulating a query.
  Key of the action result represent
  - query-id :: id of a query stored in the context or memory,
  - query-content :: sql that is a result of an action,
  - query :: query map that wraps the `query-content`,
  - database :: id of the database that query belongs to."
  [:map
   [:query-id :any]
   [:query-content :string]
   [:query :map]
   [:database :int]])

(mr/def ::operation-result
  "Result of an operation as described this ns' docstring. Stores validation result and action result iff validation
  was successful."
  [:map
   [:validation-result ::metabot.tools.sql.validation/validation-result]
   [:action-result {:optional true} ::action-result]])

(defn metadata-provider-when-native-permitted
  "Metadata provider for `database-id` when the current user has ad-hoc native query permissions on
  it, else nil. Identifier casing correction reads table/field metadata through it, which makes
  that metadata observable (a user can probe table/column existence and casing by watching what
  gets corrected); it is gated on the same native-query permission the SQL action itself requires,
  not on database read access, which is satisfied by weaker access levels. Without a provider
  validation runs uncorrected."
  [database-id]
  (when (or (not api/*current-user-id*)
            (= (perms/full-database-permission-for-user
                api/*current-user-id* :perms/create-queries database-id)
               :query-builder-and-native))
    (try
      (lib-be/application-database-metadata-provider database-id)
      (catch Exception _ nil))))

(defn- maybe-normalize-query
  [query]
  (try
    (lib-be/normalize-query query)
    (catch Exception _
      nil)))

(defn update-query-sql
  "Update a dataset_query map with new SQL content.
  Handles both legacy MBQL (`{:type :native, :native {:query ...}}`) and
  MBQL 5 (`{:stages [{:lib/type :mbql.stage/native, :native ...}]}`) formats,
  including the JSON-serialized MBQL 5 variant where enum values are strings."
  [query new-sql]
  (let [normalized (maybe-normalize-query query)]
    (cond
      (and normalized
           (lib/native-only-query? normalized)
           (string? (not-empty new-sql)))
      (lib/with-native-query normalized new-sql)

      (:native query)
      (assoc-in query [:native :query] new-sql)

      :else
      (throw (ex-info (tru "Unsupported query format")
                      {:agent-error? true})))))
