(ns metabase.explorations.models.exploration
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.schema]
   [metabase.models.interface :as mi]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn hydrate-can-write-from-parents
  "The `instances` with `k` set to whether the current user can write the row of `parent-model` that `parent-key` of
  each references, which is what writing it takes, those rows loaded and their `:can_write` hydrated at once."
  [k instances parent-key parent-model]
  (mi/instances-with-hydrated-data
   instances k
   #(let [parents (u/index-by :id (t2/hydrate (explorations.db/rows parent-model
                                                                    (into [] (comp (keep parent-key) (distinct)) instances))
                                              :can_write))]
      (into {}
            (map (fn [instance] [(:id instance) (boolean (:can_write (get parents (parent-key instance))))]))
            (remove nil? instances)))
   :id
   {:default false}))

(def ExplorationName
  "Validations for the name of an exploration. Mirrors `DocumentName`: non-blank, capped at 254
  characters."
  (mu/with-api-error-message
   [:and
    {:error/message "invalid exploration name"
     :json-schema   {:type "string" :minLength 1 :maxLength 254}}
    [:string {:min 1 :max 254}]
    [:fn
     {:error/message "invalid exploration name"}
     (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string between 1 and 254 characters.")))

(methodical/defmethod t2/table-name :model/Exploration [_model] :exploration)

(doto :model/Exploration
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn- check-can-read-keys
  "Throws unless `exploration` has the columns its `:can_read` and `:can_write` hydrations read."
  [exploration]
  (api/check-500 (contains? exploration :collection_id) "No :collection_id is set for an Exploration."))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :can_read]
  "Whether the current user reads each of `explorations`, as the content of its Collection."
  [_model _k explorations]
  (run! #(when % (check-can-read-keys %)) explorations)
  (let [readable (collection/content-readable-collection-ids (map :collection_id (remove nil? explorations))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [exploration explorations]
      (when exploration
        (vary-meta exploration assoc :can_read (contains? readable (:collection_id exploration)))))))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :can_write]
  "Whether the current user writes each of `explorations`, as the content of its Collection."
  [_model _k explorations]
  (run! #(when % (check-can-read-keys %)) explorations)
  (let [writable (collection/content-writable-collection-ids (map :collection_id (remove nil? explorations))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [exploration explorations]
      (when exploration
        (assoc exploration :can_write (contains? writable (:collection_id exploration)))))))

(defmethod mi/can-create? :model/Exploration
  [_model {collection-id :collection_id}]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :creator]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(explorations.db/user-summaries-by-id (keep :creator_id explorations))
   :creator_id
   {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :threads]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(group-by :exploration_id
              (explorations.db/threads-for-explorations (map :id explorations)))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :document]
  "Hydrate the Summary document attached to each exploration (at most one)."
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(into {}
          (map (fn [[eid docs]] [eid (first docs)]))
          (group-by :exploration_id
                    (explorations.db/summary-documents-for-explorations (map :id explorations))))
   :id
   {:default nil}))

;; `:document` is a Toucan automagic-hydration key (FK `document_id` → `:model/Document`).
;; Explorations have no such FK; without this override the automagic path wins and always
;; returns nil, shadowing [[batched-hydrate]] above.
(methodical/defmethod t2/model-for-automagic-hydration [:model/Exploration :document]
  [_model _k]
  nil)

;;; ----------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "exploration"
  {:model :model/Exploration
   :attrs {:archived :archived
           :collection-id :collection_id
           :creator-id :creator_id
           :created-at :created_at
           :updated-at :updated_at
           :exploration-id false
           :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
   :search-terms [:name :description]
   :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}
   :render-terms {:exploration-name :name
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  :collection-name            :collection.name
                  :collection-position        true
                  :collection-type            :collection.type
                  :archived-directly          true}})
