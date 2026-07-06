(ns metabase.indexes.models.table-index
  "The `metabase_table_indexes` model: index/clustering hints for a table.

  Every row binds to a transform (`:transform_id`) whose target it indexes, carries a structured index definition
  (see [[metabase.indexes.schema]]), and tracks a lifecycle `:status` (defaulting to `:create-pending`). The target table is
  read off the transform's `:target_table_id`, not mirrored here. The table is named generically so it can hold
  indexes for non-transform tables later too.

  `:structured` and `:status` are validated at the transform layer (on read and write), so every writer is covered."
  (:require
   [metabase.driver :as driver]
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
  "Statuses of a request with a real, not-yet-applied change: a driver DDL kind/op it declares (create/update/delete),
  or mid-run. Whether one actually forces a full rebuild depends on lifecycle -- see `rebuild-required?`. Distinct
  from `:verify-pending` (a bystander revalidation, see `mark-for-revalidation!`), which never does."
  #{:create-pending :update-pending :delete-pending :running})

(def ^:private runnable-statuses
  #{:create-pending :update-pending :verify-pending :running :failed})

(def ^:private defaults
  {:status :create-pending})

(defn- reset-incremental-checkpoint!
  [transform-id]
  (when (= :table-incremental
           (some-> (t2/select-one-fn :target :model/Transform :id transform-id)
                   :type
                   keyword))
    ;; Indexes are applied only when a transform recreates its target table. Resetting the checkpoint makes the next
    ;; incremental run perform that rebuild, matching the existing checkpoint-strategy change behavior.
    (t2/update! :model/Transform transform-id {:last_checkpoint_value nil})))

(defn- pending-status-for-changes
  [changes]
  (cond
    (contains? changes :structured) :update-pending
    (contains? pending-statuses (:status changes)) (:status changes)))

(defn- transform-id
  [idx]
  (or (:transform_id idx)
      (:transform_id (t2/original idx))))

(defn- checkpoint-reset-required-for-insert?
  "True unless the newly-inserted `idx`'s kind is the driver's `:standalone` lifecycle -- those apply in place via
  `CREATE INDEX IF NOT EXISTS`, no rebuild needed. Reads the transform's `:target_db_id` directly (not through
  transforms-base, which depends on this module) to look up the driver. Defaults to true, the safe/reset choice,
  when that lookup comes up empty."
  [{:keys [transform_id structured]}]
  (let [standalone? (when-let [db-id (t2/select-one-fn :target_db_id :model/Transform :id transform_id)]
                      (when-let [database (t2/select-one :model/Database db-id)]
                        (= :standalone (get-in (driver/supported-index-methods (:engine database) database)
                                               [(:kind structured) :lifecycle]))))]
    (not (true? standalone?))))

(t2/define-before-insert :model/TableIndex
  [req]
  (merge defaults req))

(t2/define-after-insert :model/TableIndex
  [idx]
  (when (checkpoint-reset-required-for-insert? idx)
    (reset-incremental-checkpoint! (:transform_id idx)))
  idx)

(t2/define-before-update :model/TableIndex
  [idx]
  (let [changes (t2/changes idx)
        status  (pending-status-for-changes changes)]
    (when status
      (reset-incremental-checkpoint! (transform-id idx)))
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
  (filter applicable?
          (t2/select :model/TableIndex
                     :transform_id transform-id
                     {:order-by [[:index_name :asc]]})))

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
  (some-> (t2/select-one :model/TableIndex :id id)
          (as-> idx (when (applicable? idx) idx))))

(defn select-pending-for-transform
  "This transform's index request rows with a real, not-yet-applied change (see [[pending-statuses]])."
  [transform-id]
  (when transform-id
    (t2/select :model/TableIndex :transform_id transform-id :status [:in pending-statuses])))

(defn select-create-pending-for-transform
  "This transform's `:create-pending` index request rows."
  [transform-id]
  (t2/select :model/TableIndex :transform_id transform-id :status :create-pending {:order-by [[:id :asc]]}))

(defn rebuild-required?
  "True when pending index request `row` needs a full table rebuild to take effect, given the driver's
  `methods` (`driver/supported-index-methods`). A pending `:standalone` create can be applied in place with
  `CREATE INDEX IF NOT EXISTS`; anything else -- an `:inline` kind (rendered into the CREATE TABLE, so it can only
  ever apply via a rebuild), or a `:standalone` update/delete (no in-place DDL exists yet) -- needs the rebuild. An
  unrecognized kind (e.g. dropped from driver support) rebuilds too, rather than silently skip a real change."
  [{:keys [status structured]} methods]
  (case status
    :create-pending (not= :standalone (get-in methods [(:kind structured) :lifecycle]))
    true))

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
  "Flip `transform-id`'s *settled* (`:succeeded`/`:failed`) index requests to `:verify-pending` and clear stale
  errors, so a future full rebuild (whenever one next happens) re-applies them against the current schema. Rows
  that already carry a real pending change (`:create-pending`/`:update-pending`/`:delete-pending`/`:running`) are
  left alone -- downgrading them here would mask that change. Unlike those, `:verify-pending` never itself forces
  a rebuild (see [[rebuild-required?]]): the transform's source/target changed, not necessarily this index's own
  definition."
  [transform-id]
  (when transform-id
    (when-let [ids (seq (into [] (comp (filter (comp #{:succeeded :failed} :status)) (map :id))
                              (select-applicable-for-transform transform-id)))]
      (t2/update! :model/TableIndex
                  {:id [:in ids]}
                  {:status :verify-pending, :error_message nil}))))

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
