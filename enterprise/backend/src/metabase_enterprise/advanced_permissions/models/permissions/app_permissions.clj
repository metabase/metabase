(ns metabase-enterprise.advanced-permissions.models.permissions.app-permissions
  "Implements granular app permissions by reading and writing the permissions
  on the app collections."
  (:require [clojure.data :as data]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.models.app.graph :as app.graph]
            [metabase.models.collection-permission-graph-revision :as c-perm-revision
             :refer [CollectionPermissionGraphRevision]]
            [metabase.models.collection.graph :as graph]
            [metabase.models.permissions :as perms]
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
  permission graph or vice versa by removing the root collection and replacing
  the collection IDs by app IDs according to `mapping`.

  Note that the app permission graph never contains the root collection. So it's
  removed when converting a collection graph to an app graph and plays no role
  when converting an app graph to a collection graph."
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

(defn update-collection-graph!
  "Update the Collections permissions graph for Collections of `collection-namespace` (default `nil`, the 'default'
  namespace). This works just like [[metabase.models.permission/update-data-perms-graph!]], but for Collections;
  refer to that function's extensive documentation to get a sense for how this works."
  [old-graph new-graph]
  (let [old-perms          (:groups old-graph)
        new-perms          (:groups new-graph)
        ;; filter out any groups not in the old graph
        new-perms          (select-keys new-perms (keys old-perms))
        ;; filter out any collections not in the old graph
        new-perms          (into {} (for [[group-id collection-id->perms] new-perms]
                                      [group-id (select-keys collection-id->perms (keys (get old-perms group-id)))]))
        [diff-old changes] (data/diff old-perms new-perms)]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when (seq changes)
      (db/transaction
        (doseq [[group-id new-group-perms] changes
                [collection-id new-perms] new-group-perms]
          (graph/update-collection-permissions! nil group-id collection-id new-perms))
       (perms/save-perms-revision! CollectionPermissionGraphRevision (:revision old-graph)
                                   (assoc old-graph :namespace nil) changes)))))

(s/defn update-graph! :- PermissionsGraph
  "Updates the app permissions according to `new-graph` and returns the
  resulting graph as read from the database. Throws an exception if the
  advanced-permissions feature is not enabled."
  [new-graph :- PermissionsGraph]
  (check-advanced-permissions)
  (db/transaction
    (let [{:keys [revision groups]} new-graph
          app-id->collection-id (db/select-id->field :collection_id 'App)
          collection-ids (vals app-id->collection-id)
          old-graph (graph/graph)
          new-graph (-> old-graph
                        (assoc :revision revision)
                        (update :groups update-vals (fn [group-permissions]
                                                      (apply dissoc group-permissions collection-ids)))
                        (update :groups merge-graphs (replace-collection-ids groups app-id->collection-id)))]
      (update-collection-graph! old-graph new-graph))
    (graph)))
