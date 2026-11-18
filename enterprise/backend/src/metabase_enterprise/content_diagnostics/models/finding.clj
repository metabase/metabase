(ns metabase-enterprise.content-diagnostics.models.finding
  "Toucan model for `content_diagnostics_finding` — a detected problem for one entity, from one scan run.
  Scan-snapshot, latest-wins; a stamped `invalidated_at` evicts a superseded/invalidated finding from the
  served set (NULL = active)."
  (:require
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ContentDiagnosticsFinding [_model] :content_diagnostics_finding)

(doto :model/ContentDiagnosticsFinding
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/ContentDiagnosticsFinding [_model]
  {:skip? false})

(t2/deftransforms :model/ContentDiagnosticsFinding
  {:entity_type  mi/transform-keyword
   :finding_type mi/transform-keyword
   ;; nullable - card findings only
   :card_type    mi/transform-keyword
   :entity_kind  mi/transform-keyword
   :details      mi/transform-json})

(def ^:private delete-batch-size
  "Rows per DELETE, so a backlog is cleared in short transactions rather than one long one."
  1000)

(defn delete-invalidated-before!
  "Hard-delete every finding invalidated before `cutoff`, a batch at a time; returns the row count.
  Active findings need no guard - their `invalidated_at` is NULL, and NULL < cutoff is never true."
  [cutoff]
  (loop [deleted 0]
    (let [n (long (cd.db/delete-invalidated-batch! cutoff delete-batch-size))]
      (if (< n delete-batch-size)
        (+ deleted n)
        (recur (+ deleted n))))))

(defn invalidate-superseded!
  "Soft-invalidate (stamp `invalidated_at`, never delete) every still-active finding of `finding-types`
  from a *prior* scan. Entities the new scan re-flagged keep a newer active row; entities it no longer
  flags drop out of the active set. Filtering on `invalidated_at` NULL keeps this idempotent."
  [scan-id finding-types]
  (when (seq finding-types)
    (cd.db/invalidate-superseded! scan-id finding-types)))

(defn invalidate-for!
  "Soft-invalidate, in one statement, the active findings of the entities `entity-ids-by-type`, a map of entity type to
  ids, and of the archived collections `collection-ids` and the collection items currently in them."
  [entity-ids-by-type collection-ids]
  (let [archived-types (conj (descendants common/hierarchy ::common/collection-item) :collection)
        clauses        (cond-> (into []
                                     (keep (fn [[entity-type ids]]
                                             (when (seq ids)
                                               [:and
                                                [:= :entity_type [:auto/param (name entity-type)]]
                                                [:in :entity_id [:auto/param (vec ids)]]])))
                                     entity-ids-by-type)
                         (seq collection-ids)
                         (into (common/entity-collection-clauses
                                archived-types
                                (fn [_etype coll-col] [:in coll-col [:auto/param (vec collection-ids)]]))))]
    (when (seq clauses)
      (cd.db/invalidate-findings-where! [:and [:= :invalidated_at nil] (into [:or] clauses)]))))

(defn invalidate-by-ids!
  "Soft-invalidate the still-active findings among `ids` that match `where`, in one transaction; returns
  the set of ids found active. Two racing calls can both report an id; the `invalidated_at` NULL guard
  still stamps it once."
  [ids where]
  (t2/with-transaction [_conn]
    (let [eligible (set (cd.db/active-finding-ids ids where))]
      (when (seq eligible)
        (cd.db/invalidate-findings-where! [:and
                                           [:in :id (vec eligible)]
                                           [:= :invalidated_at nil]]))
      eligible)))
