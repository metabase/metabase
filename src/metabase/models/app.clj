(ns metabase.models.app
  (:require [metabase.models.permissions :as perms]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel App :app)

;;; You can read/write an App if you can read/write its Collection
(derive App ::perms/use-parent-collection-perms)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class App)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:options :json
                              :nav_items :json})
          :properties (constantly {:timestamped? true
                                   :entity_id    true})})

  ;; Should not be needed as every app should have an entity_id, but currently it's
  ;; necessary to satisfy metabase-enterprise.models.entity-id-test/comprehensive-identity-hash-test.
  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:entity_id])})

(defn add-app-id
  "Add `app_id` to Collections that are linked with an App."
  {:batched-hydrate :app_id}
  [collections]
  (if-let [coll-ids (seq (into #{}
                               (comp (map :id)
                                     ;; The ID "root" breaks the query.
                                     (filter int?))
                               collections))]
    (let [coll-id->app-id (into {}
                                (map (juxt :collection_id :id))
                                (db/select [App :collection_id :id]
                                           :collection_id [:in coll-ids]))]
      (for [coll collections]
        (let [app-id (coll-id->app-id (:id coll))]
          (cond-> coll
            app-id (assoc :app_id app-id)))))
    collections))

(defn add-models
  "Add the fully hydrated models used by the app."
  {:hydrate :models}
  [app]
  (db/select 'Card {:where [:and
                            [:= :collection_id (:collection_id app)]
                            :dataset]}))
