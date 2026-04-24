(ns metabase-enterprise.dependencies.erd
  "Entity Relationship Diagram (ERD) logic: resolving focal tables,
   BFS subgraph expansion, and response building."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Schema --------------------------------------------------

(mr/def ::erd-field
  [:map
   [:id :int]
   [:name :string]
   [:display_name :string]
   [:database_type :string]
   [:semantic_type {:optional true} [:maybe :string]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:fk_target_table_id {:optional true} [:maybe :int]]])

(mr/def ::erd-node
  [:map
   [:table_id :int]
   [:name :string]
   [:display_name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db_id :int]
   [:is_focal :boolean]
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
   [:schema {:optional true} [:maybe :string]]
   [:hops {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

;;; ---------------------------------------- Phase 1: Resolve focal tables ----------------------------------------

(def ^:private auto-focal-table-count
  "Number of tables to auto-select as focal when none are specified."
  3)

(def ^:private ^{:doc "Columns needed for mi/can-read? permission checks on Table."}
  table-perm-columns
  [:id :db_id :is_published :collection_id])

(defn- auto-discover-focal-table-ids
  "Find the top N tables by FK relationship count using a SQL aggregate query.
   Only considers readable tables. Returns a set of table IDs."
  [database-id schema]
  (let [readable-ids (->> (t2/select :model/Table
                                     {:select table-perm-columns
                                      :where  (cond-> [:and
                                                       [:= :db_id database-id]
                                                       [:= :active true]]
                                                schema (conj [:= :schema schema]))})
                          (filter mi/can-read?)
                          (map :id)
                          set)]
    (when (empty? readable-ids)
      (throw (ex-info (tru "No tables found in the specified database/schema")
                      {:status-code 404
                       :database-id database-id
                       :schema      schema})))
    (let [fk-counts (t2/query {:select   [[:f.table_id :tid]
                                          [:%count.* :cnt]]
                               :from     [[:metabase_field :f]]
                               :where    [:and
                                          [:in :f.table_id readable-ids]
                                          [:not= :f.fk_target_field_id nil]
                                          [:= :f.active true]
                                          [:not= :f.visibility_type "retired"]]
                               :group-by [:f.table_id]
                               :order-by [[:cnt :desc]]
                               :limit    auto-focal-table-count})
          top-ids   (set (map :tid fk-counts))]
      ;; If no tables have FKs, just pick the first N readable IDs
      (if (empty? top-ids)
        (set (take auto-focal-table-count readable-ids))
        top-ids))))

;;; ---------------------------------------- Phase 2: Lazy BFS fetch ----------------------------------------

(defn- fetch-readable-tables
  "Fetch tables by IDs, filtering to only those the user can read.
   Returns {:tables-by-id {id -> table}, :table-ids #{ids}}."
  [table-ids]
  (when (seq table-ids)
    (let [tables   (filter mi/can-read?
                           (t2/select :model/Table :id [:in table-ids] :active true))
          by-id    (into {} (map (fn [t] [(:id t) t])) tables)]
      {:tables-by-id by-id
       :table-ids    (set (keys by-id))})))

(defn- fetch-fields-for-tables
  "Fetch all active, non-retired fields for the given table IDs.
   Returns a vector of field maps."
  [table-ids]
  (when (seq table-ids)
    (t2/select :model/Field
               :table_id [:in table-ids]
               :active true
               :visibility_type [:not= "retired"])))

(defn- discover-fk-targets
  "Given a collection of fields, find FK target field IDs that point to tables
   we haven't loaded yet. Returns the set of new table IDs to fetch.
   Checks `field-by-id` first and only queries the DB for unknown target fields."
  [fields known-table-ids field-by-id]
  (let [target-field-ids (->> fields (keep :fk_target_field_id) set)]
    (if (empty? target-field-ids)
      #{}
      (let [unknown-fids (remove field-by-id target-field-ids)
            ;; Resolve known targets from the accumulated map
            table-ids    (into #{} (keep (comp :table_id field-by-id)) target-field-ids)
            ;; Query DB only for truly unknown target fields
            table-ids    (if (seq unknown-fids)
                           (into table-ids
                                 (map :table_id)
                                 (t2/select :model/Field
                                            :id [:in unknown-fids]
                                            :active true
                                            :visibility_type [:not= "retired"]))
                           table-ids)]
        (set/difference table-ids known-table-ids)))))

(defn- fetch-erd-subgraph
  "Iteratively expand from focal tables by following FK relationships for n hops.
   Each hop fetches only newly-discovered tables and their fields.
   Returns {:tables-by-id, :fields-by-table, :field-by-id, :all-table-ids}."
  [focal-table-ids hops]
  (loop [tables-by-id    {}
         fields-by-table {}
         field-by-id     {}
         frontier        focal-table-ids
         remaining-hops  (inc hops)] ;; inc because hop 0 = loading the focal tables themselves
    (if (or (zero? remaining-hops) (empty? frontier))
      {:tables-by-id   tables-by-id
       :fields-by-table fields-by-table
       :field-by-id    field-by-id
       :all-table-ids  (set (keys tables-by-id))}
      (let [{new-tables-by-id :tables-by-id
             new-table-ids    :table-ids}  (or (fetch-readable-tables frontier)
                                               {:tables-by-id {} :table-ids #{}})
            new-fields                     (fetch-fields-for-tables new-table-ids)
            new-fields-by-table            (group-by :table_id new-fields)
            new-field-by-id                (into {} (map (fn [f] [(:id f) f])) new-fields)
            ;; Merge into accumulated state
            tables-by-id'                  (merge tables-by-id new-tables-by-id)
            fields-by-table'               (merge fields-by-table new-fields-by-table)
            field-by-id'                   (merge field-by-id new-field-by-id)
            ;; Discover next frontier: tables reachable via FKs not yet loaded
            next-frontier                  (discover-fk-targets new-fields (set (keys tables-by-id')) field-by-id')]
        (recur tables-by-id' fields-by-table' field-by-id' next-frontier (dec remaining-hops))))))

;;; ---------------------------------------- Phase 3: Build response ----------------------------------------

(defn- resolve-external-fk-targets
  "For FK target field IDs referenced by the loaded fields but not present in
   `field-by-id` (because they live in tables beyond the current hop limit),
   resolve each target field's `:table_id` from the DB and filter by the user's
   read permission on that table. Returns `{field-id {:table_id N}}` — enough
   for `build-erd-field` to populate `fk_target_table_id` without leaking
   references to tables the user can't read.

   Preserves the original security posture (unreadable targets still get nulled
   downstream) while freeing FK pointers from the accident of the hop budget."
  [all-fields field-by-id]
  (let [target-ids (into #{}
                         (comp (keep :fk_target_field_id)
                               (remove field-by-id))
                         all-fields)]
    (if (empty? target-ids)
      {}
      (let [fields          (t2/select [:model/Field :id :table_id]
                                       :id [:in target-ids]
                                       :active true
                                       :visibility_type [:not= "retired"])
            table-ids       (into #{} (map :table_id) fields)
            readable-tables (when (seq table-ids)
                              (into #{}
                                    (comp (filter mi/can-read?) (map :id))
                                    (t2/select [:model/Table :id :db_id :schema]
                                               :id [:in table-ids])))]
        (into {}
              (comp (filter #(contains? readable-tables (:table_id %)))
                    (map (juxt :id #(select-keys % [:table_id]))))
              fields)))))

(defn build-erd-field
  "Convert a field to the ERD field shape.
   Nils out FK target references only when the target table is unreadable
   (either missing or the user lacks permission); readable targets beyond the
   loaded hop budget still carry `fk_target_field_id`/`fk_target_table_id` so
   the frontend can offer to expand them."
  [field field-by-id]
  (let [target-table-id (some-> (:fk_target_field_id field) field-by-id :table_id)]
    {:id                 (:id field)
     :name               (:name field)
     :display_name       (:display_name field)
     :database_type      (:database_type field)
     :semantic_type      (some-> (:semantic_type field) u/qualified-name)
     :fk_target_field_id (when target-table-id (:fk_target_field_id field))
     :fk_target_table_id target-table-id}))

(defn build-erd-node
  "Build an ERD node for a table with its fields."
  [table fields is-focal field-by-id]
  {:table_id     (:id table)
   :name         (:name table)
   :display_name (:display_name table)
   :schema       (:schema table)
   :db_id        (:db_id table)
   :is_focal     is-focal
   :fields       (mapv #(build-erd-field % field-by-id) fields)})

(defn build-erd-edges
  "Build ERD edges from fields, filtered to only include edges between visible tables."
  [fields-by-table field-by-id visible-table-ids]
  (let [all-fields (mapcat val fields-by-table)]
    (->> all-fields
         (keep (fn [field]
                 (when-let [target-field-id (:fk_target_field_id field)]
                   (when-let [target-field (field-by-id target-field-id)]
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

(defn build-erd-response
  "Build the ERD response from fetched subgraph data."
  [{:keys [tables-by-id fields-by-table field-by-id all-table-ids]} focal-table-ids]
  (let [all-fields        (mapcat val fields-by-table)
        ;; Extend field-by-id with :table_id for FK targets that weren't loaded
        ;; into the subgraph so their pointers survive into node fields. Edges
        ;; still use the original field-by-id — they only connect visible nodes.
        field-by-id+ext   (merge (resolve-external-fk-targets all-fields field-by-id)
                                 field-by-id)
        nodes (->> all-table-ids
                   (keep (fn [tid]
                           (when-let [table (tables-by-id tid)]
                             (build-erd-node table
                                             (get fields-by-table tid [])
                                             (contains? focal-table-ids tid)
                                             field-by-id+ext))))
                   vec)
        edges (build-erd-edges fields-by-table field-by-id all-table-ids)]
    {:nodes nodes
     :edges edges}))

;;; ---------------------------------------- Main entry point ----------------------------------------

(def ^:private max-hops 5)
(def ^:private default-hops 2)

(defn erd
  "Return an ERD for the given database, optionally scoped to specific tables/schema.
   When `table-ids` is provided, those tables are the focal points.
   When only `database-id` is provided, auto-selects the most connected tables.
   The `hops` parameter controls how many FK hops to traverse (default: 2, max: 5)."
  [{:keys [database-id table-ids schema hops]}]
  (api/read-check :model/Database database-id)
  (let [hops            (min (or hops default-hops) max-hops)
        focal-table-ids (if (seq table-ids)
                          (set table-ids)
                          (auto-discover-focal-table-ids database-id schema))
        subgraph        (fetch-erd-subgraph focal-table-ids hops)]
    (build-erd-response subgraph focal-table-ids)))
