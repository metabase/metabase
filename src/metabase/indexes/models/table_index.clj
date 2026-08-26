(ns metabase.indexes.models.table-index
  "The `metabase_table_indexes` model: index/clustering hints for a table.

  Every row binds to a transform (`:transform_id`) whose target it indexes, carries a structured index definition
  (see [[metabase.indexes.schema]]), and tracks a lifecycle `:status` (defaulting to `:create-pending`). The target table is
  read off the transform's `:target_table_id`, not mirrored here. The table is named generically so it can hold
  indexes for non-transform tables later too.

  `:structured` and `:status` are validated at the transform layer (on read and write), so every writer is covered."
  (:require
   [metabase.indexes.schema :as schema]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TableIndex [_model] :metabase_table_indexes)

(doto :model/TableIndex
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def ^:private transform-structured
  "JSON in/out for `:structured`, re-keywordizing enum-valued fields (the `fixes`) and validating against the schema
  on both read and write."
  (mi/transform-validator-with-fixes
   {:in mi/json-in, :out mi/json-out-with-keywordization}
   #(mu/validate-throw ::schema/index-structured %)
   schema/keywordize-structured))

(t2/deftransforms :model/TableIndex
  {:structured transform-structured
   :status     (mi/transform-validator mi/transform-keyword (partial mi/assert-enum schema/statuses))})

(def pending-statuses
  "In-flight lifecycle statuses whose physical index state hasn't settled yet.
  Writing one of these clears any stale `:error_message` (see [[pending-status-for-changes]])."
  #{:create-pending :update-pending :delete-pending :running})

(def ^:private rebuild-forcing-statuses
  "Statuses whose physical index state can't be trusted, so the transform's next run must be a full rebuild.
  Includes `:failed`: a failed index DDL runs before the watermark is saved, so the table was already
  materialized; only a full rebuild re-attempts the index instead of appending duplicate rows from the stale
  checkpoint (and leaving the index stuck `:failed`)."
  (conj pending-statuses :failed))

(def ^:private runnable-statuses
  #{:create-pending :update-pending :running :failed})

(def ^:private defaults
  {:status :create-pending})

(defn- pending-status-for-changes
  [changes]
  (cond
    (contains? changes :structured) :update-pending
    (contains? pending-statuses (:status changes)) (:status changes)))

(t2/define-before-insert :model/TableIndex
  [req]
  (merge defaults req))

(t2/define-before-update :model/TableIndex
  [idx]
  (let [changes (t2/changes idx)
        status  (pending-status-for-changes changes)]
    (cond-> idx
      status (assoc :status status
                    :error_message nil))))

(defn applicable?
  "True when an index request should be applied to a transform's target table."
  [idx]
  (not= :delete-pending (:status idx)))

(defn select-for-transform
  "All index request rows for `transform-id`, ordered for the index manager list."
  [transform-id]
  (t2/select :model/TableIndex
             :transform_id transform-id
             {:order-by [[:id :asc]]}))

(defn select-applicable-for-transform
  "Rows whose structured definitions should be applied to `transform-id`'s target table."
  [transform-id]
  (t2/select :model/TableIndex
             :transform_id transform-id
             :status [:not= :delete-pending]
             {:order-by [[:index_name :asc]]}))

(defn select-for-verification
  "Rows the current execution can update while verifying indexes.

  `index-request-ids` is the applicable request id set hydrated at execution start. Only rows still `:running` are
  settled; if a request is edited mid-run, its pending status is left for the next rebuild. Delete-pending rows are
  also included so a successful full rebuild can remove rows for physical indexes that disappeared."
  [transform-id index-request-ids]
  (concat
   (when (seq index-request-ids)
     (t2/select :model/TableIndex
                :transform_id transform-id
                :id [:in index-request-ids]
                :status :running
                {:order-by [[:id :asc]]}))
   (t2/select :model/TableIndex
              :transform_id transform-id
              :status :delete-pending
              {:order-by [[:id :asc]]})))

(defn select-applicable-by-id
  "Fetch a single applicable index request by id."
  [id]
  (t2/select-one :model/TableIndex :id id :status [:not= :delete-pending]))

(defn pending-changes-for-transform?
  "True when `transform-id` has index changes that require a full rebuild to apply."
  [transform-id]
  (boolean
   (when transform-id
     (t2/exists? :model/TableIndex :transform_id transform-id :status [:in rebuild-forcing-statuses]))))

(defn mark-runnable-indexes-running!
  "Mark hydrated index requests that this run will apply as running.

  Returns the ids so callers can fail rows that verification cannot move to `:succeeded` or `:failed`."
  [index-request-ids]
  (let [ids (set index-request-ids)]
    (when (seq ids)
      (t2/update! :model/TableIndex
                  {:id [:in ids] :status [:in runnable-statuses]}
                  {:status :running}))
    ids))

(defn mark-unverified-running-indexes-failed!
  "Mark rows from [[mark-runnable-indexes-running!]] that are still running as failed."
  [ids message]
  (when (seq ids)
    (t2/update! :model/TableIndex
                {:id [:in ids] :status :running}
                {:status           :failed
                 :error_message    message
                 :last_executed_at :%now})))

(defn mark-for-revalidation!
  "Flip `transform-id`'s applicable index requests to `:update-pending` and clear stale errors, so the next run
  re-applies them against the current schema. Skips `:delete-pending` rows so a pending deletion isn't revived."
  [transform-id]
  (when transform-id
    (when-let [ids (seq (map :id (select-applicable-for-transform transform-id)))]
      (t2/update! :model/TableIndex
                  {:id [:in ids]}
                  {:status :update-pending, :error_message nil}))))

(defn exists-for-transform?
  "True when `transform-id` already has a request for `index-name`."
  [transform-id index-name]
  (t2/exists? :model/TableIndex
              :transform_id transform-id
              :index_name index-name))

;; Inlined into the owning transform's serialization (see the Transform make-spec's `:indexes`). Only the index
;; definition travels; lifecycle is local, so an imported index starts fresh as `:create-pending`. `:structured` holds
;; physical column names (no portable refs), so it copies verbatim. `:created_by` is skipped: a nested child's own
;; FKs aren't declared in the transform's `dependencies`, so the user may not resolve on import.
(defmethod serdes/make-spec "TableIndex"
  [_model-name _opts]
  {:copy      [:index_name :structured]
   :skip      [:status :error_message :last_executed_at :created_by]
   :transform {:transform_id (serdes/parent-ref)
               :created_at   (serdes/date)}})
