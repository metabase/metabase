(ns metabase.transforms-base.query
  "Base query transform execution - core logic without transform_run tracking.

   This namespace handles MBQL/native query transform execution and returns
   results in memory rather than writing to transform_run rows."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Interface Implementations -------------------------------------------------

(defmethod transforms-base.i/source-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms-base.i/target-db-id :query
  [transform]
  ;; For query transforms, the target needs to match the source, so use the query as the source of truth.
  (or (-> transform :source :query :database)
      ;; Fallback to using a configured value.
      (get-in transform [:target :database])
      (:target_db_id transform)))

;;; ------------------------------------------------- Schemas -------------------------------------------------

(mr/def ::transform-details
  [:map
   [:transform-type [:enum {:decode/normalize schema.common/normalize-keyword} :table :table-incremental]]
   [:conn-spec :any]
   [:query ::qp.compile/compiled]
   [:output-table [:keyword {:decode/normalize schema.common/normalize-keyword}]]])

(mr/def ::transform-opts
  [:map
   [:overwrite? :boolean]])

;;; ------------------------------------------------- Helpers -------------------------------------------------

(defn- transform-opts [{:keys [transform-type]}]
  (case transform-type
    :table {:overwrite? true}
    ;; once we have more than just append, dispatch on :target-incremental-strategy
    :table-incremental {}))

(defenterprise active?
  "Returns true if this instance is running in workspace mode - i.e. a
   dev/workspace child instance that is only allowed to write into remapped
   target schemas. OSS implementation - always false."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise db-workspace-schema
  "Return the workspace-isolated schema name configured for `db-id`, or nil
   when no workspace is configured for that database. OSS implementation -
   always nil."
  metabase-enterprise.workspaces.core
  [_db-id]
  nil)

(defn- short-hash
  "Short, stable, URL-safe hash of a string (hex, first 8 chars of SHA-1)."
  [^String s]
  (let [md     (java.security.MessageDigest/getInstance "SHA-1")
        bytes  (.digest md (.getBytes s "UTF-8"))
        hex    (apply str (map #(format "%02x" (bit-and % 0xff)) bytes))]
    (subs hex 0 8)))

(defn remapped-table-name
  "Deterministic, collision-resistant table name for a source (schema, name) pair
   landing in a shared workspace schema. Concatenates schema + '__' + name; if
   the result would exceed `max-len`, truncates and appends a short hash suffix
   of the full original combination so distinct inputs stay distinct after
   truncation. `max-len` defaults to 63 (tightest among supported warehouses)."
  ([from-schema from-name]
   (remapped-table-name from-schema from-name 63))
  ([from-schema from-name max-len]
   (let [raw (str (or from-schema "") "__" from-name)]
     (if (<= (count raw) max-len)
       raw
       (let [suffix    (str "_" (short-hash raw))
             head-len  (- max-len (count suffix))]
         (str (subs raw 0 (max head-len 0)) suffix))))))

;;; ------------------------------------------------- Base Execution -------------------------------------------------

(mu/defn run-query-transform! :- ::transforms-base.schema/execute-base-result
  "Execute query transform (MBQL/native). Returns result map.

   Does:
   - Compile query
   - Create schema if needed
   - Call driver/run-transform!

   Does NOT:
   - Create transform_run row
   - Update transform_run status
   - Sync target table (caller handles via complete-execution!)
   - Publish events (caller handles via complete-execution!)

   Options:
   - `:cancelled?` - (fn [] boolean), polled to check for cancellation
   - `:run-id` - optional, for instrumentation (nil skips metrics)
   - `:with-stage-timing-fn` - optional, (fn [run-id stage thunk] result)
   - `:table-remapping` - optional, {:schema str :name str}. When present, the
     transform writes to this schema/table instead of the transform's declared
     target. The caller (enterprise) resolves this before invoking.

   Returns:
   {:status :succeeded | :failed | :cancelled
    :result <driver result>
    :error <exception if failed>}"
  [{:keys [id source target] :as transform} :- ::transforms-base.schema/transform
   {:keys [cancelled? source-range-params table-remapping] :as _opts} :- [:maybe ::transforms-base.schema/execute-base-options]]
  (try
    ;; Check cancellation before starting
    (when (and cancelled? (cancelled?))
      (throw (ex-info "Transform cancelled before start" {:status :cancelled})))

    (let [db (get-in source [:query :database])
          {driver :engine :as database} (t2/select-one :model/Database db)
          _ (transforms-base.u/throw-if-db-routing-enabled! transform database)
          ;; Workspace-mode guardrail: a dev/workspace child instance must not
          ;; write into an unremapped target schema. If workspace mode is active
          ;; for this process and no :table-remapping was provided for this db,
          ;; abort before touching the warehouse.
          _ (when (and (active?)
                       (nil? table-remapping))
              (throw (ex-info "Refusing to run transform: workspace mode is active but no target remapping was provided for this database"
                              {:status :failed
                               :transform-id id
                               :db-id db})))
          effective-target (if table-remapping
                             (merge target table-remapping)
                             target)
          ;; First incremental run (no checkpoint) should behave like non-incremental
          ;; to drop and recreate the table rather than appending to existing data.
          effective-transform-type (if (and (= :table-incremental (keyword (:type target)))
                                            (nil? (:last_checkpoint_value transform)))
                                     :table
                                     (keyword (:type target)))
          transform-details {:db-id db
                             :database database
                             :transform-id   id
                             :transform-type effective-transform-type
                             :conn-spec (driver/connection-spec driver database)
                             :query (transforms-base.u/compile-source transform source-range-params)
                             :output-schema (:schema effective-target)
                             :output-table (transforms-base.u/qualified-table-name driver effective-target)}
          opts (transform-opts transform-details)
          features (transforms-base.u/required-database-features transform)]

      (when-not (every? (fn [feature] (driver.u/supports? (:engine database) feature database)) features)
        (throw (ex-info "The database does not support the requested transform target type."
                        {:driver driver, :database database, :features features})))

      (log/info "Executing transform" id "with target" (pr-str effective-target))

      ;; Create schema if needed
      (when-not (driver/schema-exists? driver db (:schema effective-target))
        (driver/create-schema-if-needed! driver (:conn-spec transform-details) (:schema effective-target)))

      ;; Check cancellation before running query
      (when (and cancelled? (cancelled?))
        (throw (ex-info "Transform cancelled before query execution" {:status :cancelled})))

      ;; Run the actual transform
      (let [result (driver/run-transform! driver transform-details opts)]

        ;; Check cancellation after query
        (when (and cancelled? (cancelled?))
          (throw (ex-info "Transform cancelled after query execution" {:status :cancelled})))

        {:status :succeeded
         :result result
         :source-range-params source-range-params}))

    (catch Exception e
      (let [data (ex-data e)]
        (if (= :cancelled (:status data))
          {:status :cancelled
           :error e}
          (do
            (log/error e "Error executing transform")
            {:status :failed
             :error e}))))))

;;; ------------------------------------------------- Interface Implementation -------------------------------------------------

(defmethod transforms-base.i/execute-base! :query
  [transform opts]
  (run-query-transform! transform opts))
