(ns metabase-enterprise.content-diagnostics.models.finding
  "Toucan model for `content_diagnostics_finding` — a detected problem for one entity, from one scan run.
  Scan-snapshot, latest-wins; a stamped `invalidated_at` evicts a superseded/invalidated finding from the
  served set (NULL = active)."
  (:require
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ContentDiagnosticsFinding [_model] :content_diagnostics_finding)

(doto :model/ContentDiagnosticsFinding
  (derive :metabase/model))

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

(defn- delete-batch!
  "Delete up to `delete-batch-size` findings invalidated before `cutoff`; returns the row count.
  MySQL and MariaDB reject a subquery reading the table being deleted from (error 1093), so they get
  `DELETE ... LIMIT` instead."
  [cutoff]
  (let [table (t2/table-name :model/ContentDiagnosticsFinding)]
    (t2/query-one
     (case (mdb/db-type)
       (:postgres :h2)
       {:delete-from table
        :where       [:in :id ^:allow-subquery {:select   [:id]
                                                :from     [table]
                                                :where    [:< :invalidated_at cutoff]
                                                :order-by [[:id :asc]]
                                                :limit    delete-batch-size}]}

       (:mysql :mariadb)
       {:delete-from table
        :where       [:< :invalidated_at cutoff]
        :limit       delete-batch-size}))))

(defn delete-invalidated-before!
  "Hard-delete every finding invalidated before `cutoff`, a batch at a time; returns the row count.
  Active findings need no guard - their `invalidated_at` is NULL, and NULL < cutoff is never true."
  [cutoff]
  (loop [deleted 0]
    (let [n (long (delete-batch! cutoff))]
      (if (< n delete-batch-size)
        (+ deleted n)
        (recur (+ deleted n))))))

(defn invalidate-superseded!
  "Soft-invalidate (stamp `invalidated_at`, never delete) every still-active finding of `finding-types`
  from a *prior* scan. Entities the new scan re-flagged keep a newer active row; entities it no longer
  flags drop out of the active set. Filtering on `invalidated_at` NULL keeps this idempotent."
  [scan-id finding-types]
  (when (seq finding-types)
    (t2/update! :model/ContentDiagnosticsFinding
                {:scan_id        [:not= scan-id]
                 :finding_type   [:in finding-types]
                 :invalidated_at nil}
                {:invalidated_at (mi/now)})))

(defn invalidate-for-entity!
  "Soft-invalidate every still-active finding for a single entity (`entity-type` + `entity-id`) - e.g. when
  the entity is archived or deleted through any path."
  [entity-type entity-id]
  (t2/update! :model/ContentDiagnosticsFinding
              {:entity_type    entity-type
               :entity_id      entity-id
               :invalidated_at nil}
              {:invalidated_at (mi/now)}))

(defn invalidate-for-collection-subtree!
  "Soft-invalidate the active findings of an archived collection subtree: the collections themselves, and the
  collection items currently in them (live `collection_id`, not the scan-time `scope_collection_id`).
  Archiving a collection does not archive its transforms, so their findings stay."
  [collection-ids]
  (when (seq collection-ids)
    (let [archived-types (conj (descendants common/hierarchy ::common/collection-item) :collection)]
      (t2/query-one {:update (t2/table-name :model/ContentDiagnosticsFinding)
                     :set    {:invalidated_at (mi/now)}
                     :where  [:and
                              [:= :invalidated_at nil]
                              (into [:or] (common/entity-collection-clauses
                                           archived-types
                                           (fn [_etype coll-col] [:in coll-col collection-ids])))]}))))
