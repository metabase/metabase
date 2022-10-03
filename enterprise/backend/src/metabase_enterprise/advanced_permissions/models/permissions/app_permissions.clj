(ns metabase-enterprise.advanced-permissions.models.permissions.app-permissions
  "Implements granular app permissions by reading and writing the permissions
  on the app collections."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.models.app.graph :as app.graph]
            [metabase.models.collection.graph :as graph]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :as i18n]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private GroupPermissionsGraph
  "collection-id -> status"
  {su/IntGreaterThanZero app.graph/AppPermissions}) ; be present, which is why it's *optional*

(def ^:private PermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero GroupPermissionsGraph}})

(defn- check-advanced-permissions []
  (log/fatal "checking advanced permsissions")
  (when-not (premium-features/has-feature? :advanced-permissions)
    (throw (ex-info (i18n/tru "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature.")
                    {:status-code 402}))))

(defn- replace-collection-ids
  "Convert the collection group permission graph `g` into an app group
  permission graph by removing the root collection and replacing the collection
  IDs by app IDs according to `mapping`."
  [g mapping]
  (update-vals g (fn [group-permissions]
                   (-> group-permissions
                       (dissoc :root)
                       (update-keys mapping)))))

(defn- merge-graphs
  [base override]
  (merge-with merge base override))

(s/defn graph :- PermissionsGraph
  "Returns the app permission graph. Throws an exception if the
  advanced-permissions feature is not enabled."
  []
  (check-advanced-permissions)
  (db/transaction
   (let [collection-id->app-id (set/map-invert (db/select-id->field :collection_id 'App))]
     (-> collection-id->app-id
         keys
         graph/collection-permission-graph
         (update :groups replace-collection-ids collection-id->app-id)))))

(s/defn update-graph! :- PermissionsGraph
  "Updates the app permissions according to `new-graph` and returns the
  resulting graph as read from the database. Throws an exception if the
  advanced-permissions feature is not enabled."
  [new-graph :- PermissionsGraph]
  (check-advanced-permissions)
  (db/transaction
    (let [{:keys [revision groups]} new-graph
          app-id->collection-id (db/select-id->field :collection_id 'App)
          collection-ids (vals app-id->collection-id)]
      (-> (graph/graph)
          (assoc :revision revision)
          (update :groups update-vals (fn [group-permissions]
                                        (apply dissoc group-permissions :root collection-ids)))
          (update :groups merge-graphs (replace-collection-ids groups app-id->collection-id))
          graph/update-graph!))
    (graph)))
