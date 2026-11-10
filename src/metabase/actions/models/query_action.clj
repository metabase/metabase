(ns metabase.actions.models.query-action
  "The QueryAction model: the native query of an action of type query."
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/QueryAction [_model] :query_action)

(doto :model/QueryAction
  (derive :metabase/model)
  (derive :hook/search-index)
  (derive :hook/dependencies))

(methodical/defmethod t2/primary-keys :model/QueryAction [_model] [:action_id])

(t2/deftransforms :model/QueryAction
  {:dataset_query lib-be/transform-query})

(defn- set-query-database
  "`query-action` with the `:database_id` of its query, when it has one, as a row copied whole may hold its query
  undecoded."
  [{query :dataset_query, :as query-action}]
  (if-let [database-id (when (map? query) (:database query))]
    (assoc query-action :database_id database-id)
    query-action))

(defn- check-query
  "Throws a 400 unless the query of `query-action` is empty or native."
  [{query :dataset_query}]
  (when (and (map? query)
             (seq query)
             (not (lib/native-only-query? (lib-be/normalize-query query))))
    (throw (ex-info (tru "An action''s query has to be a native query.") {:status-code 400}))))

(t2/define-before-insert :model/QueryAction
  [query-action]
  (check-query query-action)
  (set-query-database query-action))

(t2/define-before-update :model/QueryAction
  [query-action]
  (when (contains? (t2/changes query-action) :dataset_query)
    (check-query query-action))
  (set-query-database query-action))

(defmethod serialization/spec :model/QueryAction [_]
  {:schema    ::actions.schema/external-query-action
   :identity  [:action_id]
   :primary-key :action_id
   :skip      [:legacy_query]
   :parent    {:model :model/Action :key :action_id}
   :transform {:action_id     serialization/import-only-transform
               :database_id   serialization/database-transform
               :dataset_query serialization/mbql-transform}})

(defmethod remote-sync/spec :model/QueryAction
  [_model]
  {:synced-filter-clause actions.db/synced-action-details-clause})
