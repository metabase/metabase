(ns metabase.warehouse-index-manager.core
  "Public surface for the warehouse index manager. Endpoint shims in
  `metabase.warehouse-schema-rest.api.table` should call into here, not the
  internal namespaces directly."
  (:require
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.warehouse-index-manager.builder :as builder]
   [metabase.warehouse-index-manager.ddl-parse :as ddl-parse]
   [metabase.warehouse-index-manager.introspection :as introspection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- driver-supported? [driver-kw]
  (boolean (and driver-kw (isa? driver/hierarchy driver-kw :postgres))))

(defn- table-meta
  "Resolve the warehouse table + its driver into a uniform map. Returns
  nil when the table or its database is missing."
  [table]
  (when-let [database (and (:db_id table) (t2/select-one :model/Database :id (:db_id table)))]
    (let [driver-kw (some-> database :engine keyword)]
      {:table     table
       :database  database
       :driver-kw driver-kw
       :supported (driver-supported? driver-kw)})))

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
  (let [{:keys [database driver-kw supported]} (table-meta table)
        rows     (when supported
                   (introspection/fetch-indexes
                    driver-kw database [(:schema table) (:name table)]))
        lookup   (requests-by-name (:id table))
        indexes  (mapv (partial introspection-row->index lookup) (or rows []))]
    {:table   {:id               (:id table)
               :schema           (:schema table)
               :name             (:name table)
               :transform_id     (:transform_id table)
               :driver           (some-> driver-kw name)
               :driver_supported supported
               :can_manage       (boolean (and supported (:transform_id table) can-manage?))}
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
        ;; Should be impossible — we just rendered the statement — but
        ;; surface it as a 500-ish so we hear about it loudly.
        (throw (ex-info "Generated statement failed validation"
                        {:reason :builder-output-rejected
                         :detail (:detail parsed)
                         :statement (:statement built)})))
      built)))
