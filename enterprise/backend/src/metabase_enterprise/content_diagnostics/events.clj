(ns metabase-enterprise.content-diagnostics.events
  "Keep content-diagnostics findings consistent with entity lifecycle. When a flagged entity is archived
  (card/dashboard/document) or deleted, or a collection subtree is archived, its active findings are invalidated so it
  drops out of the served set immediately instead of lingering until the next scan."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]))

(def ^:private entity-types
  "The entity type of the findings of each model that has them."
  {:model/Card      :card
   :model/Dashboard :dashboard
   :model/Document  :document
   :model/Transform :transform})

(defn- invalidation
  "What the lifecycle `event` invalidates: `[:collection collection-row]` for the archive of a Collection,
  `[entity-type id]` for the archive or delete of an entity that has findings, nil otherwise."
  [{:keys [model object previous-object] :as event}]
  (let [row       (or object previous-object)
        archived? (and (true? (:archived object)) (u.events/changed? event :archived))]
    (cond
      (and (= :model/Collection model) archived?)        [:collection row]
      (and (entity-types model) (or (nil? object) archived?)) [(entity-types model) (:id row)])))

(defn- owner
  "The one owner of every event of a batch that invalidates findings, nil for the others and without the feature."
  [event]
  (when (and (invalidation event) (premium-features/has-feature? :content-diagnostics))
    ::findings))

(defn- invalidate-batch!
  "Invalidate in one statement the active findings of the entities that `events` archive or delete, and of the archived
  collections with the subtrees of those archived directly, logging the error of that statement, which fails the write on Postgres, where an error aborts the transaction."
  [_owner events _all-events]
  (let [invalidations  (keep invalidation events)
        collections    (keep (fn [[k row]] (when (= :collection k) row)) invalidations)
        collection-ids (into #{}
                             (mapcat (fn [row]
                                       (cons (:id row)
                                             (when (:archived_directly row)
                                               (collection/descendant-ids row)))))
                             collections)
        entity-ids     (reduce (fn [acc [k id]]
                                 (cond-> acc (not= :collection k) (update k (fnil conj #{}) id)))
                               {}
                               invalidations)]
    (try
      (finding/invalidate-for! entity-ids collection-ids)
      (catch Throwable e
        (log/errorf "Failed to invalidate content-diagnostics findings of %d entities: %s"
                    (count invalidations) (ex-message e))))))

(events/register-owned-consumer! ::invalidate owner invalidate-batch!)
