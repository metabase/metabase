(ns metabase-enterprise.advanced-permissions.models.permissions.app-permissions
  "Implements granular app permissions by reading and writing the permissions
  on the app collections."
  (:require [clojure.data :as data]
            [clojure.set :as set]
            [metabase.models.app-permission-graph-revision :as app-perm-revision
             :refer [AppPermissionGraphRevision]]
            [metabase.models.collection.graph :as graph]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :as i18n]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- check-advanced-permissions []
  (when-not (premium-features/has-feature? :advanced-permissions)
    (throw (ex-info (i18n/tru "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature.")
                    {:status-code 402}))))

(defn- replace-collection-ids
  "Convert the collection group permission graph `permission-graph` into an
  app group permission graph or vice versa by replacing the collection IDs
  by app IDs according to `mapping`.
  Stray collections in the :apps namespace are ignored."
  [group-permissions mapping]
  (let [full-mapping (assoc mapping :root :root)]
    (update-vals group-permissions (fn [coll-perms]
                                     (into {}
                                           (for [[coll-id perm] coll-perms
                                                 :let [app-id (full-mapping coll-id)]
                                                 :when app-id]
                                             [app-id perm]))))))

(s/defn graph :- graph/PermissionsGraph
  "Returns the app permission graph. Throws an exception if the
  advanced-permissions feature is not enabled.

  This works by reading the permissions for app collections and replacing
  the IDs of the collections with the corresponding app IDs."
  []
  (check-advanced-permissions)
  (db/transaction
    (let [collection-id->app-id (set/map-invert (db/select-id->field :collection_id 'App))]
      (-> (graph/graph :apps)
          (assoc :revision (app-perm-revision/latest-id))
          (update :groups replace-collection-ids collection-id->app-id)))))

(s/defn update-graph! :- graph/PermissionsGraph
  "Updates the app permissions according to `new-graph` and returns the
  resulting graph as read from the database. Throws an exception if the
  advanced-permissions feature is not enabled."
  [new-graph :- graph/PermissionsGraph]
  (check-advanced-permissions)
  (db/transaction
    (let [old-graph (graph)
          old-perms (:groups old-graph)
          new-perms (:groups new-graph)
          ;; filter out any groups not in the old graph
          new-perms (select-keys new-perms (keys old-perms))
          ;; filter out any collections not in the old graph
          new-perms (into {} (for [[group-id collection-id->perms] new-perms]
                               [group-id (select-keys collection-id->perms
                                                      (keys (get old-perms group-id)))]))
          [diff-old changes] (data/diff old-perms new-perms)]
      (perms/log-permissions-changes diff-old changes)
      (perms/check-revision-numbers old-graph new-graph)
      (when (seq changes)
        (let [app-id->collection-id
              (assoc (db/select-id->field :collection_id 'App) :root :root)]
          (doseq [[group-id new-group-perms] changes
                  [app-id new-perms] new-group-perms
                  :let [collection-id (app-id->collection-id app-id)]]
            (graph/update-collection-permissions! :apps group-id collection-id new-perms))
          (perms/save-perms-revision! AppPermissionGraphRevision (:revision old-graph)
                                      old-graph changes))))
    (graph)))
