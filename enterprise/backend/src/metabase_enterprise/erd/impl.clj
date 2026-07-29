(ns metabase-enterprise.erd.impl
  "Entity Relationship Diagram (ERD) logic: resolving focal tables,
   one-layer FK expansion, and response building."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Schema --------------------------------------------------

(mr/def ::erd-field
  [:map
   [:id :int]
   [:name :string]
   [:display_name :string]
   [:database_type :string]
   ;; `base_type` / `effective_type` are emitted so the frontend can use the
   ;; shared `getColumnIcon` helper (which keys off Lib type predicates) instead
   ;; of redoing icon mapping from `database_type` strings.
   [:base_type {:optional true} [:maybe :string]]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:fk_target_table_id {:optional true} [:maybe :int]]])

;; Mirrors the `:owner` hydration on Table: when `owner_user_id` is set we
;; return the full user shape, otherwise (`owner_email` only) we return a
;; map carrying just `:email`. `nil` covers both no-owner and the
;; `owner_user_id`-points-to-missing-user case.
(mr/def ::erd-owner
  [:maybe
   [:map
    [:id          {:optional true} :int]
    [:email       :string]
    [:first_name  {:optional true} [:maybe :string]]
    [:last_name   {:optional true} [:maybe :string]]]])

(mr/def ::erd-node
  [:map
   [:table_id :int]
   [:name :string]
   [:display_name :string]
   [:description {:optional true} [:maybe :string]]
   [:owner       {:optional true} ::erd-owner]
   [:schema {:optional true} [:maybe :string]]
   [:visibility_type {:optional true} [:maybe :keyword]]
   [:db_id :int]
   [:fields [:sequential ::erd-field]]])

(mr/def ::erd-edge
  [:map
   [:source_table_id :int]
   [:source_field_id :int]
   [:target_table_id :int]
   [:target_field_id :int]
   [:relationship [:enum "one-to-one" "many-to-one"]]])

(mr/def ::erd-response
  [:map
   [:nodes [:sequential ::erd-node]]
   [:edges [:sequential ::erd-edge]]])

(mr/def ::erd-request
  [:map
   [:database-id ms/PositiveInt]
   [:table-ids {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
   [:schema {:optional true} [:maybe :string]]])

;;; ---------------------------------------- Phase 1: Resolve focal tables ----------------------------------------

(def ^:private table-select-columns
  "Columns we read from Table: the perm columns needed for `mi/can-read?`
   (`:db_id`, `:is_published`, `:collection_id`) plus the display columns the
   ERD response surfaces (`:description`, owner fields hydrated below)."
  [:id :db_id :name :display_name :schema :is_published :collection_id
   :description :owner_user_id :owner_email :visibility_type])

(defn- schema-clause
  "The rest of the database API treats a blank schema name as the union of nil
   and empty-string schemas. Keep that convention here too."
  [schema]
  (if (= schema "")
    [:or
     [:= :schema nil]
     [:= :schema ""]]
    [:= :schema schema]))

(defn- index-by-id [xs]
  (into {} (map (juxt :id identity)) xs))

(defn- readable-tables
  "Fetch readable, active tables in `database-id`.
   Optional `table-ids` restricts by IDs; optional `schema` restricts by schema.
   `schema=\"\"` matches both nil and empty-string schemas."
  [database-id & {:keys [table-ids schema] :as opts}]
  (if (and (contains? opts :table-ids) (empty? table-ids))
    []
    (let [where (cond-> [:and
                         [:= :db_id database-id]
                         [:= :active true]]
                  (contains? opts :table-ids) (conj [:in :id table-ids])
                  (contains? opts :schema)    (conj (schema-clause schema)))]
      (->> (t2/select :model/Table
                      {:select table-select-columns
                       :where  where})
           (filter mi/can-read?)))))

(defn- readable-table-ids
  [database-id & opts]
  (into #{} (map :id) (apply readable-tables database-id opts)))

;;; ---------------------------------------- Phase 2: Fetch ERD graph ----------------------------------------

(defn- fetch-fields-for-tables
  "Fetch all active fields for the given table IDs.
   Returns a vector of field maps ordered by the same ordering
   as table metadata view (`/api/table/:id/query_metadata`)."
  [table-ids]
  (when (seq table-ids)
    (t2/select :model/Field
               {:where    [:and
                           [:in :table_id table-ids]
                           [:= :active true]]
                :order-by schema.table/field-order-rule})))

(defn- fetch-fields-by-ids
  "Fetch active fields by ID."
  [field-ids]
  (when (seq field-ids)
    (t2/select :model/Field
               {:where [:and
                        [:in :id field-ids]
                        [:= :active true]]})))

(defn- discover-fk-targets
  "Given a collection of fields, find FK target field IDs that point to tables
   we haven't loaded yet. Returns the set of new table IDs to fetch.
   Checks `loaded-field-by-id` first and only queries the DB for unknown target fields."
  [fields known-table-ids loaded-field-by-id]
  (let [target-field-ids (->> fields (keep :fk_target_field_id) set)]
    (if (empty? target-field-ids)
      #{}
      (let [unknown-fids (remove loaded-field-by-id target-field-ids)
            ;; Resolve known targets from the accumulated map
            table-ids    (into #{} (keep (comp :table_id loaded-field-by-id)) target-field-ids)
            ;; Query DB only for truly unknown target fields
            table-ids    (if (seq unknown-fids)
                           (into table-ids
                                 (map :table_id)
                                 (fetch-fields-by-ids unknown-fids))
                           table-ids)]
        (set/difference table-ids known-table-ids)))))

(defn- fetch-erd-subgraph
  "Load the focal tables plus one layer of readable FK target tables.

   The focal set is loaded without applying the schema boundary so explicitly
   expanded cross-schema tables can become nodes. The one FK-neighbor layer is
   schema-scoped when a schema was selected; off-schema targets still surface
   later as FK target IDs, but not as nodes."
  [database-id focal-tables schema-selected? schema]
  (let [focal-table-ids        (into #{} (map :id) focal-tables)
        focal-fields           (fetch-fields-for-tables focal-table-ids)
        focal-field-by-id      (index-by-id focal-fields)
        neighbor-table-ids     (discover-fk-targets focal-fields focal-table-ids focal-field-by-id)
        neighbor-tables        (if schema-selected?
                                 (readable-tables database-id :table-ids neighbor-table-ids :schema schema)
                                 (readable-tables database-id :table-ids neighbor-table-ids))
        neighbor-table-ids     (into #{} (map :id) neighbor-tables)
        neighbor-fields        (fetch-fields-for-tables neighbor-table-ids)
        ;; Batch-hydrate `:owner` once across the whole node set so the
        ;; per-node build doesn't trigger N+1 user lookups.
        all-tables             (t2/hydrate (concat focal-tables neighbor-tables) :owner)
        all-fields             (concat focal-fields neighbor-fields)]
    {:tables-by-id       (index-by-id all-tables)
     :fields-by-table    (group-by :table_id all-fields)
     :loaded-field-by-id (index-by-id all-fields)}))

;;; ---------------------------------------- Phase 3: Build response ----------------------------------------

(defn- resolve-external-fk-targets
  "For FK target field IDs referenced by the loaded fields but not present in
   `loaded-field-by-id` (because they live outside the loaded node set),
   resolve each target field's `:table_id` from the DB and filter by the user's
   read permission on that table. Returns `{field-id table-id}` — enough for
   `build-erd-field` to populate `fk_target_table_id` without leaking
   references to tables the user can't read.

   Preserves the original security posture (unreadable targets still get nulled
   downstream) while allowing the frontend to expand readable off-canvas tables."
  [database-id all-fields loaded-field-by-id]
  (let [target-ids (into #{}
                         (comp (keep :fk_target_field_id)
                               (remove loaded-field-by-id))
                         all-fields)]
    (if (empty? target-ids)
      {}
      (let [fields                   (fetch-fields-by-ids target-ids)
            table-ids                 (into #{} (map :table_id) fields)
            readable-target-table-ids (readable-table-ids database-id :table-ids table-ids)]
        (into {}
              (comp (filter #(contains? readable-target-table-ids (:table_id %)))
                    (map (juxt :id :table_id)))
              fields)))))

(defn- build-erd-field
  "Convert a field to the ERD field shape.
   Nils out FK target references only when the target table is unreadable
   (either missing or the user lacks permission); readable targets outside the
   loaded node set still carry `fk_target_field_id`/`fk_target_table_id` so
   the frontend can offer to expand them."
  [field target-field-id->table-id]
  (let [target-table-id (get target-field-id->table-id (:fk_target_field_id field))]
    {:id                 (:id field)
     :name               (:name field)
     :display_name       (:display_name field)
     :database_type      (:database_type field)
     :base_type          (some-> (:base_type field) u/qualified-name)
     :effective_type     (some-> (:effective_type field) u/qualified-name)
     :semantic_type      (some-> (:semantic_type field) u/qualified-name)
     :fk_target_field_id (when target-table-id (:fk_target_field_id field))
     :fk_target_table_id target-table-id}))

(defn- build-erd-node
  "Build an ERD node for a table with its fields."
  [table fields target-field-id->table-id]
  {:table_id     (:id table)
   :name         (:name table)
   :display_name (:display_name table)
   :description  (:description table)
   :owner        (:owner table)
   :schema       (:schema table)
   :visibility_type (:visibility_type table)
   :db_id        (:db_id table)
   :fields       (mapv #(build-erd-field % target-field-id->table-id) fields)})

(defn- build-erd-edges
  "Build ERD edges from fields, filtered to only include edges between visible tables."
  [fields-by-table loaded-field-by-id visible-table-ids]
  (let [all-fields (mapcat val fields-by-table)]
    (->> all-fields
         (keep (fn [field]
                 (when-let [target-field-id (:fk_target_field_id field)]
                   (when-let [target-field (loaded-field-by-id target-field-id)]
                     (let [target-table (:table_id target-field)]
                       (when (and (contains? visible-table-ids (:table_id field))
                                  (contains? visible-table-ids target-table))
                         {:source_table_id (:table_id field)
                          :source_field_id (:id field)
                          :target_table_id target-table
                          :target_field_id target-field-id
                          :relationship    (if (and (:database_is_pk field)
                                                    (:database_is_pk target-field))
                                             "one-to-one"
                                             "many-to-one")}))))))
         vec)))

(defn- build-erd-response
  "Build the ERD response from fetched subgraph data."
  [database-id {:keys [tables-by-id fields-by-table loaded-field-by-id]}]
  (let [visible-table-ids          (set (keys tables-by-id))
        all-fields                 (mapcat val fields-by-table)
        loaded-target-table-ids    (into {} (map (juxt :id :table_id)) (vals loaded-field-by-id))
        external-target-table-ids  (resolve-external-fk-targets database-id all-fields loaded-field-by-id)
        target-field-id->table-id  (merge external-target-table-ids loaded-target-table-ids)
        nodes (->> visible-table-ids
                   (keep (fn [tid]
                           (when-let [table (tables-by-id tid)]
                             (build-erd-node table
                                             (get fields-by-table tid [])
                                             target-field-id->table-id))))
                   vec)
        edges (build-erd-edges fields-by-table loaded-field-by-id visible-table-ids)]
    {:nodes nodes
     :edges edges}))

;;; ---------------------------------------- Main entry point ----------------------------------------

(defn- resolve-focal-tables
  [{:keys [database-id table-ids schema-selected? schema]}]
  (let [explicit-table-ids (not-empty (set table-ids))]
    (cond
      schema-selected?
      (let [schema-tables   (readable-tables database-id :schema schema)
            explicit-tables (when explicit-table-ids
                              (readable-tables database-id :table-ids explicit-table-ids))
            tables          (vals (index-by-id (concat schema-tables explicit-tables)))]
        (when (and (empty? schema-tables) (empty? explicit-table-ids))
          (throw (ex-info (tru "No tables found in the specified database/schema")
                          {:status-code 404
                           :database-id database-id
                           :schema      schema})))
        tables)

      explicit-table-ids
      (readable-tables database-id :table-ids explicit-table-ids)

      :else
      (let [tables (readable-tables database-id)]
        (when (empty? tables)
          (throw (ex-info (tru "No tables found in the specified database")
                          {:status-code 404
                           :database-id database-id})))
        tables))))

(defn erd
  "Return an ERD for the given database, optionally scoped by schema and/or
   specific tables.

   Focal-set rules:
   - `schema` set: focal = all readable tables in that schema, plus any
     `table-ids` (which are treated as additional focal tables, typically from
     other schemas the user has expanded into via FK click).
   - no `schema`, `table-ids` set: those are the focal tables.
   - no `schema` or `table-ids`: all readable tables in the database.

   When `schema` is set, the one-layer FK expansion stops at that schema —
   cross-schema FK targets are surfaced on fields (so the UI can offer to expand
   them) but are not loaded as nodes unless explicitly listed in `table-ids`."
  [{:keys [database-id schema-selected?] :as request}]
  (api/read-check :model/Database database-id)
  (let [focal-tables (resolve-focal-tables request)
        subgraph     (fetch-erd-subgraph database-id focal-tables schema-selected? (:schema request))]
    (build-erd-response database-id subgraph)))
