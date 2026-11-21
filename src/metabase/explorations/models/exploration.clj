(ns metabase.explorations.models.exploration
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.app-db.copy-spec :as app-db-copy]
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
  (derive :hook/entity-id)
  (derive :hook/events))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-collections-not-archived!
  "Throws a 400 unless each of `rows`, with its `archived` state, may be in its Collection, which is not archived unless
  the row is, reading the Collections once."
  [rows]
  (let [archived-ids (collection/archived-collection-ids (map :collection_id rows))]
    (doseq [{:keys [archived collection_id]} rows]
      (collection/check-collection-not-archived
       archived (when collection_id {:archived (contains? archived-ids collection_id)})))))

(mu/defn create-explorations! :- [:sequential :map]
  "Insert the Exploration `rows` and return the inserted instances, in one transaction and one batch of events. An
  Exploration in an archived Collection throws unless it is archived."
  [rows :- [:sequential ::explorations.schema/exploration.create]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (check-collections-not-archived! rows)
      (vec (explorations.db/insert-explorations! rows)))))

(mu/defn create-exploration! :- :map
  "Insert the Exploration `exploration` and return it, as [[create-explorations!]] does."
  [exploration :- ::explorations.schema/exploration.create]
  (first (create-explorations! [exploration])))

(defn- with-archived-directly
  "`row`, an update of the Exploration `stored`, with the `archived_directly` that a change of `archived` gives unless the
  row gives one: true when the Exploration is archived by itself, which is when its Collection is not archived,
  `archived-ids` holding the archived Collections."
  [stored row archived-ids]
  (if (and (contains? row :archived) (not= (boolean (:archived row)) (boolean (:archived stored))))
    (cond-> row
      (not (contains? row :archived_directly))
      (assoc :archived_directly
             (boolean (and (:archived row)
                           (not (contains? archived-ids (if (contains? row :collection_id)
                                                          (:collection_id row)
                                                          (:collection_id stored))))))))
    row))

(defn- changed?
  "Whether `row`, the columns to write, changes the column `k` of `stored`."
  [stored row k]
  (and (contains? row k) (not= (get row k) (get stored k))))

(defn- set-summary-documents-archived!
  "Archives the Summary Documents of the Explorations of `rows`, update rows that change `archived`, that their archive
  takes along, and restores those that its archive took down."
  [rows]
  (doseq [[archived? group] (group-by (comp boolean :archived) rows)
          :let [ids          (mapv :id group)
                document-ids (mapv :id (explorations.db/summary-documents-following-explorations ids archived?))]
          :when (seq document-ids)]
    (events/with-event-context {:archived-with [:model/Exploration (first ids)]}
      (document/update-documents! (mapv (fn [id] {:id id :archived archived?}) document-ids)))))

(mu/defn update-explorations! :- [:sequential ::explorations.schema/exploration.update-row]
  "Apply the columns of each of `rows` to the Exploration with its `:id` and return the rows of Explorations that exist,
  in one transaction and one batch of events, with one statement per distinct set of changes. An Exploration moved into
  an archived Collection throws unless it is archived, a change of `archived` gives its `archived_directly` and
  archives or restores its Summary Documents."
  [rows :- [:sequential ::explorations.schema/exploration.update-row]]
  (let [stored (u/index-by :id (explorations.db/rows :model/Exploration (mapv :id rows)))
        rows   (filterv #(contains? stored (:id %)) rows)]
    (if (empty? rows)
      rows
      (events/with-batched-events
        (let [archiving    (filterv #(contains? % :archived) rows)
              archived-ids (collection/archived-collection-ids
                            (map #(if (contains? % :collection_id) (:collection_id %) (:collection_id (get stored (:id %))))
                                 archiving))
              rows*        (mapv #(with-archived-directly (get stored (:id %)) % archived-ids) rows)
              moved        (filterv #(changed? (get stored (:id %)) % :collection_id) rows*)]
          (check-collections-not-archived!
           (for [row moved]
             {:collection_id (:collection_id row)
              :archived      (if (contains? row :archived) (:archived row) (:archived (get stored (:id row))))}))
          (doseq [[changes group] (group-by #(dissoc % :id) rows*)
                  :when           (seq changes)]
            (explorations.db/update-explorations! (mapv :id group) changes))
          (set-summary-documents-archived! (filterv #(changed? (get stored (:id %)) % :archived) rows*))
          rows)))))

(mu/defn update-exploration!
  "Apply `changes` to the Exploration with `exploration-id`, as [[update-explorations!]] does."
  [exploration-id :- ms/PositiveInt
   changes        :- (mut/select-keys ::explorations.schema/exploration.update [:name :description :archived :collection_id :collection_position])]
  (update-explorations! [(assoc changes :id exploration-id)])
  nil)

(mu/defn delete-explorations! :- :nil
  "Delete the Explorations with `exploration-ids` in one batch of events."
  [exploration-ids :- [:sequential ms/PositiveInt]]
  (when (seq exploration-ids)
    (events/with-batched-events
      (explorations.db/delete-explorations! exploration-ids)))
  nil)

(mu/defn delete-exploration!
  "Delete the Exploration with `exploration-id`, as [[delete-explorations!]] does."
  [exploration-id :- ms/PositiveInt]
  (delete-explorations! [exploration-id]))

(mu/defn revert-exploration! :- :int
  "Write to the Exploration with `id` the tracked columns of the revision `snapshot` that its table still has, in one
  statement through the model, returning the number updated."
  [id        :- ms/PositiveInt
   _user-id  :- [:maybe ::lib.schema.id/user]
   snapshot  :- :map]
  (explorations.db/update-exploration-columns! id (revisions/columns-to-revert :model/Exploration id snapshot)))

(defmethod collection/archive-in-collections! :model/Exploration
  [model collection-ids]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-explorations! (mapv (fn [id] {:id id :archived true}) ids))))

(defmethod collection/restore-in-collections! :model/Exploration
  [model collection-ids]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-explorations! (mapv (fn [id] {:id id :archived false}) ids))))

;;; ----------------------------------------------------- Specs -----------------------------------------------------

(defmethod events/spec :model/Exploration
  [_model]
  {:create :event/exploration-create
   :update :event/exploration-update
   :delete :event/exploration-delete})

(defmethod app-db-copy/spec :model/Exploration [_model]
  {:skip? false})

(defmethod revisions/spec :model/Exploration [_model]
  {:revert! revert-exploration!
   :track [:name :description :collection_id :archived]
   :skip  [:archived_directly :collection_position :creator_id :entity_id]})

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
