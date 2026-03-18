(ns metabase-enterprise.metabot-v3.tools.sql.common
  "Namespace that aggregates functionality common to tools sql namespaces.

  Those are:
  - `metabot-v3.tools.create-sql-query`,
  - `metabot-v3.tools.edit-sql-query`,
  - `metabot-v3.tools.replace-sql-query`.

  Each of those namespaces define an _operation_:
  - `create-sql-query`,
  - `edit-sql-query`,
  - `replace-sql-query`."
  (:require
   [metabase-enterprise.metabot-v3.tools.sql.validation :as metabot-v3.tools.sql.validation]
   [metabase.lib.core :as lib]
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
   [:validation-result ::metabot-v3.tools.sql.validation/validation-result]
   [:action-result {:optional true} ::action-result]])

(defn update-query-sql
  "Update a dataset_query map with new SQL content."
  [query new-sql]
  (cond
    (and (lib/native-only-query? query)
         (string? (not-empty new-sql)))
    (lib/with-native-query query new-sql)

    (:native query)
    (assoc-in query [:native :query] new-sql)

    :else
    (throw (ex-info (tru "Unsupported query format")
                    {:agent-error? true}))))
