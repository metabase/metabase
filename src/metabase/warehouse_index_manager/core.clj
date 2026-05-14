(ns metabase.warehouse-index-manager.core
  "Public surface for the warehouse index manager. Endpoint shims in
  `metabase.warehouse-schema-rest.api.table` should call into here, not the
  internal namespaces directly."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-index-manager.builder :as builder]
   [metabase.warehouse-index-manager.ddl-execute :as ddl-execute]
   [metabase.warehouse-index-manager.ddl-parse :as ddl-parse]
   [metabase.warehouse-index-manager.introspection :as introspection]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn- driver-supported? [driver-kw]
  (boolean (and driver-kw (isa? driver/hierarchy driver-kw :postgres))))

(defn- table-meta
  "Resolve the warehouse table + its driver into a uniform map. Returns
  nil when the table or its database is missing."
  [table]
  (when-let [database (and (:db_id table) (t2/select-one :model/Database :id (:db_id table)))]
    (let [driver-kw  (some-> database :engine keyword)
          supported  (driver-supported? driver-kw)
          concurrent (boolean (and supported
                                   (driver/database-supports?
                                    driver-kw :index/create-concurrently database)))]
      {:table       table
       :database    database
       :driver-kw   driver-kw
       :supported   supported
       :concurrent? concurrent})))

(defn- request-map
  "Strip an `IndexRequest` row down to the FE-shaped subset embedded in
  list-indexes responses."
  [req]
  (when req
    {:id               (:id req)
     :status           (:status req)
     :error_message    (:error_message req)
     :created_by_id    (:created_by_id req)
     :created_at       (:created_at req)
     :last_executed_at (:last_executed_at req)}))

(defn- requests-by-name
  "Map of lowercase index name → IndexRequest row for `table-id`."
  [table-id]
  (into {} (map (juxt (comp u/lower-case-en :index_name) identity))
        (t2/select :model/IndexRequest :table_id table-id)))

(defn- introspection-row->index
  [requests-lookup row]
  (let [req (get requests-lookup (some-> (:name row) u/lower-case-en))]
    {:name              (:name row)
     :definition        (:definition row)
     :access_method     (:access_method row)
     :is_unique         (:is_unique row)
     :is_primary        (:is_primary row)
     :is_valid          (:is_valid row)
     :key_columns       (:key_columns row)
     :include_columns   (:include_columns row)
     :partial_predicate (:partial_predicate row)
     :managed_by_metabase (some? req)
     :request             (request-map req)}))

(defn list-indexes
  "Build the `GET /api/table/:id/indexes` response payload for `table`.

  Always returns a 200-shaped body; non-Postgres tables surface as
  `:indexes []` with `:driver_supported false`."
  [table can-manage?]
  (let [{:keys [database driver-kw supported concurrent?]} (table-meta table)
        rows    (when supported
                  (introspection/fetch-indexes
                   driver-kw database [(:schema table) (:name table)]))
        lookup  (requests-by-name (:id table))
        indexes (mapv (partial introspection-row->index lookup) (or rows []))]
    {:table   {:id                  (:id table)
               :schema              (:schema table)
               :name                (:name table)
               :transform_id        (:transform_id table)
               :driver              (some-> driver-kw name)
               :driver_supported    supported
               :supports_concurrent concurrent?
               :can_manage          (boolean (and supported (:transform_id table) can-manage?))}
     :indexes indexes}))

(defn preview
  "Render `structured` to a CREATE INDEX statement for `table`. Throws
  ex-info with `:reason` on validation failure; the caller maps that to
  HTTP 400.

  Validates against the warehouse driver (Postgres only) and the table's
  Field names — callers don't need to pre-check either."
  [table structured]
  (let [{:keys [supported]} (table-meta table)]
    (when-not supported
      (throw (ex-info "Index management is Postgres-only"
                      {:reason :driver-not-supported})))
    (let [field-names (set (t2/select-fn-set (comp u/lower-case-en :name)
                                             :model/Field
                                             :table_id (:id table)
                                             :active true))
          built       (builder/build-statement
                       {:schema (:schema table) :table (:name table)}
                       structured
                       field-names)
          parsed      (ddl-parse/parse (:statement built)
                                       #{[(:schema table) (:name table)]})]
      (when-not (:ok? parsed)
        (throw (ex-info "Generated statement failed validation"
                        {:reason :builder-output-rejected
                         :detail (:detail parsed)
                         :statement (:statement built)})))
      built)))

;;; ---------------------------------------------------------------------------
;;; Mutating operations (BE-3)

(defn- field-names [table-id]
  (set (t2/select-fn-set (comp u/lower-case-en :name)
                         :model/Field
                         :table_id table-id
                         :active true)))

(defn- ensure-manageable!
  "Pre-flight checks for any mutating endpoint. Returns the resolved
  `{:keys [table database driver-kw]}` map. Throws ex-info with
  `:status-code` on failure so the API layer just rethrows."
  [table]
  (when-not (:transform_id table)
    (throw (ex-info "Index management is only available for transform-managed tables"
                    {:reason :not-transform-managed :status-code 403})))
  (let [{:keys [database driver-kw supported]} (table-meta table)]
    (when-not supported
      (throw (ex-info "Index management is Postgres-only"
                      {:reason :driver-not-supported :status-code 400})))
    {:table table :database database :driver-kw driver-kw}))

(defn- resolve-statement
  "Given either `:statement` or `:structured` in `body`, return a validated
  CREATE INDEX statement + (optional) structured form for the row.
  Throws ex-info with `:status-code 400` on validation failure."
  [table {:keys [statement structured]}]
  (cond
    structured
    (let [built (builder/build-statement
                 {:schema (:schema table) :table (:name table)}
                 structured
                 (field-names (:id table)))]
      {:statement  (:statement built)
       :structured structured})

    (and (string? statement) (not (str/blank? statement)))
    (let [parsed (ddl-parse/parse statement
                                  #{[(:schema table) (:name table)]})]
      (when-not (:ok? parsed)
        (throw (ex-info (or (:detail parsed) "Invalid CREATE INDEX statement")
                        {:reason     (:reason parsed)
                         :detail     (:detail parsed)
                         :status-code 400})))
      {:statement  statement
       :index_name (:name parsed)
       :structured nil})

    :else
    (throw (ex-info "Either :statement or :structured is required"
                    {:reason :missing-body :status-code 400}))))

(defn- parsed-index-name
  "Statement → name. Statement here has already been validated."
  [table statement]
  (-> (ddl-parse/parse statement #{[(:schema table) (:name table)]})
      :name))

(defn- drop-statement
  "DROP INDEX CONCURRENTLY IF EXISTS for an index on `schema`."
  [schema index-name]
  (str "DROP INDEX CONCURRENTLY IF EXISTS "
       (sql/format-entity (keyword schema))
       "."
       (sql/format-entity (keyword index-name))))

(defn- mark-running! [request-id]
  (t2/update! :model/IndexRequest request-id {:status :running}))

(defn- mark-terminal! [request-id status error-message]
  (t2/update! :model/IndexRequest request-id
              {:status           status
               :error_message    error-message
               :last_executed_at (OffsetDateTime/now)}))

(defn- execute-status->terminal
  "Translate a `ddl-execute/execute!` result into `[status error-message]`."
  [{:keys [status error-message]}]
  (case status
    :executed [:succeeded nil]
    :failed   [:failed    error-message]
    :skipped  [:failed    error-message]))

(defn- run-create!
  "Quick-task body for create. Idempotent under `IF NOT EXISTS`."
  [request-id driver-kw database statement]
  (mark-running! request-id)
  (let [result   (ddl-execute/execute! driver-kw database statement)
        [s msg]  (execute-status->terminal result)]
    (mark-terminal! request-id s msg)))

(defn- run-edit!
  "Drop the previous index (best-effort if the previous row was succeeded)
  then create the new one. Both run in the same task so the row can't be
  observed in an inconsistent in-flight state by other ops."
  [request-id driver-kw database {:keys [old-index-name old-schema previously-succeeded?]} new-statement]
  (mark-running! request-id)
  (when (and previously-succeeded? old-index-name old-schema)
    (let [drop-sql (drop-statement old-schema old-index-name)
          result   (ddl-execute/execute! driver-kw database drop-sql)]
      (when (= :failed (:status result))
        (log/warnf "edit-request %s: dropping previous index %s failed: %s"
                   request-id old-index-name (:error-message result)))))
  (let [result  (ddl-execute/execute! driver-kw database new-statement)
        [s msg] (execute-status->terminal result)]
    (mark-terminal! request-id s msg)))

(defn- run-drop!
  "Drop the index then delete the IndexRequest row. We delete rather than
  mark `:dropped` so the (table_id, index_name) UNIQUE slot frees up for
  a re-create with the same name."
  [request-id driver-kw database schema index-name]
  (mark-running! request-id)
  (let [result  (ddl-execute/execute! driver-kw database (drop-statement schema index-name))
        [s msg] (execute-status->terminal result)]
    (case s
      :succeeded (t2/delete! :model/IndexRequest request-id)
      :failed    (mark-terminal! request-id :failed msg))))

(defn- not-in-flight?!
  "Throws 409 if the request is currently pending or running. Used to
  reject concurrent PUTs and DELETEs."
  [request]
  (when (#{:pending :running} (:status request))
    (throw (ex-info "Request is already in flight; wait for it to finish"
                    {:reason :in-flight :status-code 409})))
  request)

(defn submit-create!
  "Validate body, insert IndexRequest, queue the create. Returns the new
  row. Maps UNIQUE constraint violations to 409."
  [table body user-id]
  (let [{:keys [database driver-kw]} (ensure-manageable! table)
        {:keys [statement structured index_name]} (resolve-statement table body)
        idx-name (or index_name (parsed-index-name table statement))
        row      (try
                   (t2/insert-returning-instance!
                    :model/IndexRequest
                    {:table_id      (:id table)
                     :transform_id  (:transform_id table)
                     :index_name    idx-name
                     :statement     statement
                     :structured    structured
                     :status        :pending
                     :created_by_id user-id})
                   (catch Exception e
                     (throw (ex-info (str "An index named " idx-name " already exists for this table")
                                     {:reason :duplicate-index-name :status-code 409}
                                     e))))]
    (quick-task/submit-task!
     #(run-create! (:id row) driver-kw database statement))
    row))

(defn get-request
  "Fetch a single IndexRequest, scoped to `table-id`. Returns nil if
  missing or owned by a different table."
  [table-id request-id]
  (t2/select-one :model/IndexRequest :id request-id :table_id table-id))

(defn submit-edit!
  "Validate the new body, update the row, queue drop-old + create-new.
  Rejects with 409 when the request is currently in flight."
  [table request-id body]
  (let [{:keys [database driver-kw]} (ensure-manageable! table)
        old (not-in-flight?!
             (or (get-request (:id table) request-id)
                 (throw (ex-info "Request not found"
                                 {:reason :not-found :status-code 404}))))
        {:keys [statement structured index_name]} (resolve-statement table body)
        new-name (or index_name (parsed-index-name table statement))
        old-state {:old-index-name        (:index_name old)
                   :old-schema            (:schema table)
                   :previously-succeeded? (= :succeeded (:status old))}]
    (try
      (t2/update! :model/IndexRequest request-id
                  {:index_name new-name
                   :statement  statement
                   :structured structured
                   :status     :pending
                   :error_message nil})
      (catch Exception e
        (throw (ex-info (str "An index named " new-name " already exists for this table")
                        {:reason :duplicate-index-name :status-code 409}
                        e))))
    (quick-task/submit-task!
     #(run-edit! request-id driver-kw database old-state statement))
    (t2/select-one :model/IndexRequest :id request-id)))

(defn submit-drop!
  "Queue DROP INDEX for the request's index_name. Rejects with 409 when
  the request is currently in flight."
  [table request-id]
  (let [{:keys [database driver-kw]} (ensure-manageable! table)
        req (not-in-flight?!
             (or (get-request (:id table) request-id)
                 (throw (ex-info "Request not found"
                                 {:reason :not-found :status-code 404}))))]
    (t2/update! :model/IndexRequest request-id
                {:status :pending :error_message nil})
    (quick-task/submit-task!
     #(run-drop! request-id driver-kw database (:schema table) (:index_name req)))
    {:request_id request-id :status :pending}))
