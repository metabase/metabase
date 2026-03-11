(ns metabase-enterprise.replacement.convert
  "Logic for converting a model (card) to a transform and replacing all usages."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- sanitize-table-name
  "Convert a model name to a valid SQL table name.
   Lowercase, replace non-alphanumeric chars with underscore, collapse multiple underscores,
   trim leading/trailing underscores, truncate to 63 chars."
  [s]
  (let [sanitized (-> s
                      u/lower-case-en
                      (str/replace #"[^a-z0-9]+" "_")
                      (str/replace #"_+" "_")
                      (str/replace #"^_|_$" ""))]
    (subs sanitized 0 (min (count sanitized) 63))))

(defn- unique-table-name
  "Generate a non-colliding table name in the given schema.
   If `base-name` already exists, try base-name_2, base-name_3, etc."
  [db-id schema base-name]
  (let [existing (into #{}
                       (map :name)
                       (t2/select [:model/Table :name]
                                  :db_id db-id
                                  :schema schema
                                  :active true))]
    (if-not (contains? existing base-name)
      base-name
      (loop [n 2]
        (let [candidate (str base-name "_" n)]
          (if-not (contains? existing candidate)
            candidate
            (recur (inc n))))))))

(defn- phase-progress
  "Creates an IRunnerProgress that writes 0→1 progress to a specific column on the run record.
   Checks for cancellation on each advance."
  [run-id column]
  (let [total*     (atom 1)
        completed* (atom 0)]
    (reify replacement.protocols/IRunnerProgress
      (set-total! [_ total] (reset! total* total))
      (advance! [this] (replacement.protocols/advance! this 1))
      (advance! [this n]
        (let [c        (swap! completed* + n)
              t        @total*
              progress (if (pos? t) (double (/ c t)) 0.0)]
          (replacement-run/update-phase-progress! run-id column progress)
          (when (replacement.protocols/canceled? this)
            (throw (ex-info "Run canceled" {:run-id run-id})))))
      (canceled? [_]
        (not (:is_active (t2/select-one [:model/ReplacementRun :is_active] :id run-id))))
      ;; Lifecycle methods are no-ops per phase — the outer execute-async! harness handles these
      (start-run! [_])
      (succeed-run! [_])
      (fail-run! [_ _]))))

(defn convert-card-to-transform!
  "Convert a model to a transform, execute it, and replace all usages of the model
   with the new output table.

   Called as the work-fn inside execute-async!. Progress is tracked via three
   independent phase-progress objects writing to separate DB columns.

   Phases:
   1. transform_progress — create transform + run it (includes sync)
   2. sync_progress — confirm table exists, record table ID
   3. replacement_progress — replace all model usages with new table"
  [card-id run-id]
  (let [card (t2/select-one :model/Card :id card-id)
        _    (when-not (= "model" (:type card))
               (throw (ex-info "Card is not a model" {:card-id card-id})))

        ;; Determine target database and table name
        db-id      (get-in card [:dataset_query :database])
        base-name  (sanitize-table-name (:name card))
        table-name (unique-table-name db-id "transforms" base-name)

        ;; --- Phase 1: Create + run transform ---
        transform-prog (phase-progress run-id :transform_progress)
        _              (replacement.protocols/set-total! transform-prog 2)

        ;; Create transform
        transform  (transforms/create-transform!
                    {:name        (:name card)
                     :description (:description card)
                     :source      {:type  "query"
                                   :query (:dataset_query card)}
                     :target      {:type   "table"
                                   :schema "transforms"
                                   :name   table-name}})
        _          (replacement.protocols/advance! transform-prog) ;; 0.5

        ;; Execute transform (synchronous — this also syncs the output table)
        _          (transforms/execute! transform {:run-method :manual})
        _          (replacement.protocols/advance! transform-prog) ;; 1.0

        ;; --- Phase 2: Confirm sync, get table ID ---
        sync-prog  (phase-progress run-id :sync_progress)
        _          (replacement.protocols/set-total! sync-prog 1)

        target-db-id (transforms-base.i/target-db-id transform)
        table      (t2/select-one :model/Table
                                  :db_id target-db-id
                                  :schema "transforms"
                                  :name table-name
                                  :active true)
        _          (when-not table
                     (throw (ex-info "Output table not found after transform execution"
                                     {:db-id target-db-id :schema "transforms" :name table-name})))
        table-id   (:id table)

        ;; Record the actual target on the run
        _          (replacement-run/update-target! run-id :table table-id)
        _          (replacement.protocols/advance! sync-prog) ;; 1.0

        ;; --- Phase 3: Replace all usages ---
        replace-prog (phase-progress run-id :replacement_progress)]

    (replacement.runner/run-swap [:card card-id] [:table table-id] replace-prog)))
