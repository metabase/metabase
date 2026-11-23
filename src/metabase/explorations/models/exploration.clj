(ns metabase.explorations.models.exploration
  (:require
   [clojure.string :as str]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.models.document :as document]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.explorations.collection-items :as explorations.collection-items]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.revisions.core :as revisions]
   [metabase.search.spec :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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

;;; ---------------------------------------------------- Hooks -------------------------------------------------------

(t2/define-before-update :model/Exploration
  [exploration]
  (let [changes (t2/changes exploration)]
    (cond-> exploration
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (explorations.db/archived-directly-clause changes)))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-explorations
  "Throw a 400 unless each of `rows`, holding the `:collection_id` and `:archived` state an Exploration is about to have,
  satisfies these rules, with one read of the Collections:

  - its Collection is not archived, unless the Exploration is"
  [rows]
  (let [archived-ids (collection/archived-collection-ids (map :collection_id rows))]
    (doseq [{:keys [archived collection_id]} rows]
      (collection/check-collection-not-archived
       archived (when collection_id {:archived (contains? archived-ids collection_id)})))))

(mr/def ::write-opts
  "The options of a write function of Explorations: `:writer`, who writes when it matters, and the context of its events."
  [:maybe [:map {:closed true}
           [:writer  {:optional true} [:enum :revert]]
           [:context {:optional true} [:maybe :metabase.events.schema/context]]]])

(mu/defn create-explorations! :- [:sequential (ms/InstanceOf :model/Exploration)]
  "Insert the Exploration `rows` and return the inserted instances, in one transaction, publishing their create event.
  An Exploration in an archived Collection throws unless it is archived."
  [rows :- [:sequential ::explorations.schema/exploration.create]]
  (app-db/create-batched! :model/Exploration rows
                          {:before-create check-explorations
                           :after-create  #(events/publish-event! :event/exploration-create (events/create-event %))}))

(defn- changed?
  "Whether `changes` changes the column `k` of `stored`."
  [stored changes k]
  (and (contains? changes k) (not= (get changes k) (get stored k))))

(defn- set-summary-documents-archived!
  "Archives the Summary Documents of the Explorations with `ids`, which their archive takes along, when `archived?`, and
  restores those that it took down otherwise, their events carrying the `:context` of `opts` or else the archive of the
  Exploration."
  [ids archived? opts]
  (when-let [document-ids (not-empty (mapv :id (explorations.db/summary-documents-following-explorations ids archived?)))]
    (document/update-documents! (mapv (fn [id] {:id id :archived archived?}) document-ids) {:context (or (:context opts) {:archived-with [:model/Exploration (first ids)]})})))

(defn- set-summaries-archived-of!
  "Archives or restores the Summary Documents of the Explorations of `rows`, which change `archived`, with one write for
  each direction."
  [rows opts]
  (doseq [[archived? group] (group-by (comp boolean :archived) rows)]
    (set-summary-documents-archived! (mapv :id group) archived? opts)))

(defn- derive-archived-directly
  "`updates`, with the `archived_directly` that the write gave each of those that change `archived`, read from
  `id->updated`, the Explorations after the write."
  [updates id->updated]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (contains? row :archived) (assoc :archived_directly (:archived_directly (get id->updated id)))))
        updates))

(defn- check-exploration-updates
  "Throw a 400 unless every one of `updates` that moves an Exploration of `id->stored` satisfies these rules:

  - its Collection is not archived, unless the Exploration is"
  [updates id->stored]
  (check-explorations
   (for [row   (filterv #(changed? (get id->stored (:id %)) % :collection_id) updates)]
     {:collection_id (:collection_id row)
      :archived      (if (contains? row :archived) (:archived row) (:archived (get id->stored (:id row))))})))

(defn- update-exploration-batch!
  "Check and write `updates`, one batch of a call, archive or restore the Summary Documents that follow, and return the
  rows written, with the `archived_directly` the write gave them, and the Explorations by id as stored before. The
  Summary Documents follow after the write, since their `archived_directly` derives from the written Exploration."
  [updates opts]
  (let [id->stored  (explorations.db/explorations-by-ids (mapv :id updates))
        updates     (filterv #(contains? id->stored (:id %)) updates)
        _           (check-exploration-updates updates id->stored)
        _           (explorations.db/update-explorations! updates)
        _           (set-summaries-archived-of! (filterv #(changed? (get id->stored (:id %)) % :archived) updates) opts)
        id->updated (explorations.db/explorations-by-ids (mapv :id updates))]
    {:updates    (derive-archived-directly updates id->updated)
     :id->stored id->stored}))

(mu/defn update-explorations! :- :nil
  "Apply `updates`, each the `:id` of an Exploration with the columns to give it, in one transaction, publishing their
  update event with the `:context` of `opts`."
  ([updates :- [:sequential ::explorations.schema/exploration.update]]
   (update-explorations! updates nil))
  ([updates :- [:sequential ::explorations.schema/exploration.update]
    opts    :- ::write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv #(update-exploration-batch! (vec %) opts) (partition-all app-db/update-partition-size updates))]
       (when (some (comp seq :updates) batches)
         (events/publish-event! :event/exploration-update
                                (events/update-event (into {} (map :id->stored) batches)
                                                     (into [] (mapcat :updates) batches)
                                                     opts)))))
   nil))

(mu/defn delete-explorations! :- :nil
  "Delete the Explorations with `ids` in one transaction, publishing their delete event right before the first
  statement."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/Exploration ids
                          {:before-delete #(events/publish-event! :event/exploration-delete (events/delete-event %))}))

(mu/defn revert-exploration! :- :int
  "Write the revision `snapshot` to the Exploration with `id` in one statement without the cascades of an update."
  [id        :- ms/PositiveInt
   _user-id  :- [:maybe ::lib.schema.id/user]
   snapshot  :- ::explorations.schema/exploration.revision]
  (t2/with-transaction [_conn]
    (let [previous (first (explorations.db/rows :model/Exploration [id]))
          updated  (explorations.db/update-exploration-columns! id snapshot)]
      (when previous
        (events/publish-event! :event/exploration-update
                               (events/update-event {id previous} [(assoc snapshot :id id)]
                                                    {:writer :revert})))
      updated)))

(defmethod collection/archive-in-collections! :model/Exploration
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-explorations! (mapv (fn [id] {:id id :archived true}) ids) opts)))

(defmethod collection/restore-in-collections! :model/Exploration
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-explorations! (mapv (fn [id] {:id id :archived false}) ids) opts)))

;;; ----------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/Exploration [_model]
  {:skip? false})

(defmethod revisions/spec :model/Exploration [_model]
  {:track   [:name :description :collection_id :archived]
   :skip    [:archived_directly :collection_position :creator_id :entity_id]
   :schema  ::explorations.schema/exploration.revision
   :revert! revert-exploration!})

(defmethod search/spec :model/Exploration
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

(defmethod collection-items/spec :model/Exploration [_model]
  {"exploration" {:items   explorations.db/collection-exploration-items
                  :hydrate explorations.collection-items/hydrate}})

(defmethod eid-translation/spec :model/Exploration [_model]
  {:names [:exploration]})
