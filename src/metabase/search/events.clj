(ns metabase.search.events
  "The search index as a consumer of the lifecycle events of the models that feed it: the writes of a batch enqueue
  one ingestion each for the rows created, the rows updated and the rows deleted. The documents that a delete leaves
  unpurgeable are enumerated at the delete, before it runs, and checked once it commits."
  (:require
   [metabase.events.core :as events]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- feeds-index?
  "Whether the `operation` of a write of `model`, which has a search spec or derives `:search/indexed` as the models
  that only feed the document of another model do, can change the search index."
  [model operation]
  (or (search/indexed-model? model)
      (isa? model :search/indexed)
      (and (= :delete operation) (isa? model :search/indexed-deletes))))

(def ^:private revisioned-search-models
  "The models of the entities whose documents take their last editor and edit time from a Revision, by the `:model`
  that a Revision names them with."
  {"Card"      :model/Card
   "Dashboard" :model/Dashboard})

(defn- revised-model
  "The model of the entity whose document the `event` of the creation of a Revision refreshes, or nil for any other
  event."
  [{:keys [model operation object]}]
  (when (and (= :model/Revision model) (= :create operation))
    (revisioned-search-models (:model object))))

(defn- revised-entity
  "The entity that the `event` of the creation of a Revision names, as the instance that the search hooks of its model
  select by."
  [{:keys [object] :as event}]
  (t2/instance (revised-model event) {:id (:model_id object)}))

(defn- capture-dependents
  "The documents that the delete of the rows of the delete `events` of one model leaves unpurgeable, skipping the
  enumeration on a search error, which must not fail the delete, and leaving those documents to the scheduled reindex."
  [events]
  (when-let [{:keys [model operation]} (first events)]
    (when (and (= :delete operation)
               (feeds-index? model operation)
               (not search.ingestion/*disable-updates*)
               (search/supports-index?))
      (try
        (search/cascading-documents (mapv #(t2/instance model (:previous-object %)) events))
        (catch InterruptedException e
          (.interrupt (Thread/currentThread))
          (log/errorf e "Interrupted; skipping search cascade enumeration for %s" model)
          nil)
        (catch Exception e
          (log/errorf e "Skipping search cascade enumeration for %s" model)
          nil)))))

(defn- updated-instance
  "The row of an update as an instance whose changes are the columns that the update set."
  [{:keys [model object previous-object changed]}]
  ;; The columns come from `changed`, not from a diff of `object` against `previous-object`, because the timestamp
  ;; hook sets `updated_at` as SQL, so `object` carries the old value and a diff misses it. The instance starts without
  ;; those columns so that each counts as changed, whether or not its value in `object` differs.
  (merge (t2/instance model (apply dissoc (into {} previous-object) changed))
         (select-keys object changed)))

(defn- handle-deleted!
  "Hand off the re-derivation of the documents of the `deleted` rows once the transaction commits."
  [deleted]
  (let [instances  (mapv #(t2/instance (:model %) (:previous-object %)) deleted)
        dependents (apply merge-with into (keep #(get-in % [:captures :search]) deleted))
        steps      (cond-> []
                     (search/feeds-documents? instances)
                     (conj (fn [] (search/bulk-update! instances)))

                     (seq dependents)
                     (conj (fn [] (search/reconcile-cascading-documents! dependents))))]
    (when (seq steps)
      (apply search/after-commit! "delete" steps))))

(defn- handle!
  [_owner events _all]
  (when-not search.ingestion/*disable-updates*
    (let [revised (filter revised-model events)
          events  (filter #(feeds-index? (:model %) (:operation %)) events)
          by-op   (group-by :operation events)
          created (map #(t2/instance (:model %) (:object %)) (:create by-op))
          updated (map updated-instance (:update by-op))
          deleted (:delete by-op)]
      ;; A Revision is no row of a document: the entity it records is reindexed by its own id, whichever Revisions
      ;; the batch inserted after it.
      (when (seq revised)
        (search/bulk-update! (into [] (comp (map revised-entity) (distinct)) revised)))
      (when (seq created)
        (search/bulk-update! created))
      (when (seq updated)
        (search/update-changed! updated))
      (when (seq deleted)
        (handle-deleted! deleted)))))

(events/register-capture! :search capture-dependents)
(events/register-owned-consumer! :search
                                 (fn [{:keys [model operation] :as event}]
                                   (when (or (feeds-index? model operation) (revised-model event)) :search))
                                 handle!
                                 {:last? true})
