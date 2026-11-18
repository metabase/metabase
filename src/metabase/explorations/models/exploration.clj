(ns metabase.explorations.models.exploration
  (:require
   [clojure.string :as str]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection :as collection]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.schema]
   [metabase.models.interface :as mi]
   [metabase.revisions.core :as revisions]
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
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod eid-translation/spec :model/Exploration [_model]
  {:names [:exploration]})

(defmethod events/spec :model/Exploration
  [_model]
  {:create :event/exploration-create
   :update :event/exploration-update
   :delete :event/exploration-delete})

(defmethod revisions/spec :model/Exploration [_model]
  {:track [:name :description :collection_id :archived]
   :skip  [:archived_directly :collection_position :creator_id :entity_id]})

(defmethod app-db-copy/spec :model/Exploration [_model]
  {:skip? false})

(defmethod mi/after-archived-change :model/Exploration
  [_model rows changes]
  (doseq [{:keys [id]} rows]
    (events/with-event-context {:archived-with [:model/Exploration id]}
      (if (:archived changes)
        (explorations.db/archive-summary-documents! id)
        (explorations.db/unarchive-summary-documents! id)))))

(t2/define-before-insert :model/Exploration
  [{:keys [archived collection_id] :as exploration}]
  (collection/check-collection-not-archived archived collection_id)
  exploration)

(t2/define-before-update :model/Exploration
  [{:keys [archived collection_id] :as exploration}]
  (let [changes (t2/changes exploration)]
    (when (contains? changes :collection_id)
      (collection/check-collection-not-archived archived collection_id))
    (cond-> exploration
      (contains? changes :archived) (assoc :archived_directly (mi/archived-directly exploration #(collection/archived? collection_id))))))

(mi/define-update-in-transaction :model/Exploration)

(methodical/defmethod t2/batched-hydrate [:model/Exploration :can_read]
  "Whether the current user reads each of `explorations`, as the content of its Collection."
  [_model _k explorations]
  (collection/hydrate-content-can-read :model/Exploration explorations {:audit-rules? false}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :can_write]
  "Whether the current user writes each of `explorations`, as the content of its Collection."
  [_model _k explorations]
  (collection/hydrate-content-can-write :model/Exploration explorations {:audit-rules? false}))

(defmethod mi/can-create? :model/Exploration
  [_model {collection-id :collection_id}]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defmethod mi/can-update? :model/Exploration
  [exploration changes]
  (boolean
   (and (mi/can-write? exploration)
        (mi/archive-followers-updatable? exploration changes :model/Document
                                         (partial explorations.db/summary-documents-following (:id exploration))))))

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

(defmethod search.spec/spec :model/Exploration
  [_model]
  {"exploration"
   {:attrs {:archived :archived
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
                   :archived-directly          true}}})
