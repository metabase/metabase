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
  "The row of an update as an instance that knows its changes."
  [{:keys [model object previous-object]}]
  (reduce-kv (fn [instance column value]
               (cond-> instance
                 (not= value (get previous-object column)) (assoc column value)))
             (t2/instance model previous-object)
             object))

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

(defn- edited-dashboard-id
  "The id of the Dashboard whose last edit by a user the dashcard or tab `event` is, which records a Revision of the
  Dashboard but writes no row that feeds its document."
  [{:keys [model user-id object previous-object]}]
  (when (and user-id (#{:model/DashboardCard :model/DashboardTab} model))
    (:dashboard_id (or object previous-object))))

(defn- handle!
  [_owner events _all]
  (when-not search.ingestion/*disable-updates*
    (let [edited     (into #{} (keep edited-dashboard-id) events)
          events     (filter #(feeds-index? (:model %) (:operation %)) events)
          by-op      (group-by :operation events)
          created    (map #(t2/instance (:model %) (:object %)) (:create by-op))
          updated    (map updated-instance (:update by-op))
          deleted    (:delete by-op)]
      (when (seq created)
        (search/bulk-update! created))
      (when (seq updated)
        (search/update-changed! updated))
      (when (seq edited)
        (search/bulk-update! (map #(t2/instance :model/Dashboard {:id %}) edited)))
      (when (seq deleted)
        (handle-deleted! deleted)))))

(events/register-capture! :search capture-dependents)
(events/register-owned-consumer! :search
                                 (fn [{:keys [model operation] :as event}]
                                   (when (or (feeds-index? model operation) (edited-dashboard-id event)) :search))
                                 handle!
                                 {:last? true})
