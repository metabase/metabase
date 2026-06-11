(ns metabase-enterprise.semantic-search.db.migration.impl
  (:require
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase.collections.curation :as collections.curation]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [toucan2.core :as t2]))

(def schema-version
  "Version to compare the [[metabase-enterprise.semantic-search.db.migration/db-version]] with. If this is higher,
  schema migration will be performed."
  2)

(defn- drop-all-but-migration-table
  [tx]
  (let [table-names (map (comp first vals)
                         (jdbc/execute! tx
                                        (sql/format
                                         {:select [[:tablename :xi]]
                                          :from [:pg_tables]
                                          :where [:and
                                                  [:<> :schemaname [:inline "information_schema"]]
                                                  [:<> :schemaname [:inline "pg_catalog"]]
                                                  [:<> :tablename  [:inline "migration"]]]})))]
    (doseq [table table-names]
      (jdbc/execute! tx
                     (sql/format
                      {:drop-table  [[[:raw table]]]})))))

(defn migrate-schema!
  "Migrate schema (control, metadata, gate, ...). Migration author is responsible for removing leftovers if necessary
  and in general leaving schema in desired state."
  [tx {:keys [index-metadata] :as _opts}]
  ;; ideally index_table indexed are manipulated in dynamic schema part but for now it does not matter
  (drop-all-but-migration-table tx)
  (semantic.index-metadata/create-tables-if-not-exists! tx index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! tx index-metadata))

(def dynamic-schema-version
  "Code version of dynamic schema (index_table_xyzs). If higher than what's found in db dynamic schema migration will
  be attempted."
  5)

(defn- alter-index-tables!
  "Run `alter-fn` against each existing index table whose `index_version` is below `target-version`, then bump those
   rows' `index_version` to `target-version`. `alter-fn` is `(fn [execute! table-name])`. Tables listed in
   `index_metadata` but missing from the database (e.g. dropped externally) are skipped — leaving the metadata row
   in place to be cleaned up or re-created elsewhere."
  [tx index-metadata target-version alter-fn]
  (let [metadata-table  (keyword (:metadata-table-name index-metadata))
        execute!        (fn [q] (jdbc/execute! tx (sql/format q)))
        candidate-names (->> (execute! {:select-distinct [:table_name]
                                        :from            [metadata-table]
                                        :where           [[:< :index_version target-version]]})
                             (mapcat vals))
        existing-names  (when (seq candidate-names)
                          (->> (execute! {:select [:tablename]
                                          :from   [:pg_tables]
                                          :where  [:in :tablename (vec candidate-names)]})
                               (mapcat vals)
                               set))
        table-names     (filter existing-names candidate-names)]
    (when (seq table-names)
      (doseq [table-name table-names]
        (alter-fn execute! table-name))
      (execute! {:update metadata-table
                 :set    {:index_version target-version}
                 :where  [[:in :table_name (vec table-names)]]}))))

(defn- add-personal-owner-id-column!
  "Migration 2: Add `personal_owner_id` column to index tables for SQL-level personal collection filtering."
  [tx index-metadata]
  (alter-index-tables! tx index-metadata 2
                       (fn [execute! table-name]
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:personal_owner_id :int :if-not-exists]]}))))

(defn- add-collection-type-and-data-layer-columns!
  "Migration 3: Add `collection_type` and `data_layer` columns to index tables.
  `collection_type` is surfaced for downstream consumers (e.g. `metabase.search.impl/serialize`);
  `data_layer` powers the `:data-layer` scorer (per-tier weights under `:data-layer/*`).
  The `:library` scorer was reworked in migration 4 to read `root_collection_type` instead."
  [tx index-metadata]
  (alter-index-tables! tx index-metadata 3
                       (fn [execute! table-name]
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:collection_type :text :if-not-exists]]})
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:data_layer :text :if-not-exists]]}))))

(defn- library-root-type-by-collection-id
  "Map `collection-id → root-collection-type` for every collection in a Library tree.
  Returns `{}` and logs a warning if the appdb lookup fails."
  [library-types]
  ;; Catch covers test setups that exercise pgvector before the appdb schema is up;
  ;; production semantic-search init always runs after appdb migration.
  (try
    (u/for-map [{root-id :id root-type :type} (t2/select [:model/Collection :id :type]
                                                         :type [:in library-types]
                                                         :location "/")
                coll-id (cons root-id (t2/select-pks-set :model/Collection
                                                         :location [:like (str "/" root-id "/%")]))]
      [coll-id root-type])
    (catch Exception e
      (log/warn e "Skipping Library forest backfill — appdb lookup failed")
      {})))

(defn- add-root-collection-type-column!
  "Migration 4: add `root_collection_type` to index tables, backfilling first from each row's
  gate document and then from an appdb sweep of the Library forest. Drives the `:library` scorer."
  [tx index-metadata]
  ;; Library types are hardcoded: migrations are frozen snapshots, and semantic-search doesn't `:use` `collections`.
  (let [gate-table           (:gate-table-name index-metadata)
        library-types        ["library" "library-data" "library-metrics"]
        ;; Resolved once — the same map applies to every index table.
        root-type-by-coll-id (library-root-type-by-collection-id library-types)]
    (alter-index-tables!
     tx index-metadata 4
     (fn [execute! table-name]
       (let [kw-tbl             (keyword table-name)
             kw-gate            (keyword gate-table)
             tbl-model          (keyword table-name "model")
             tbl-model-id       (keyword table-name "model_id")
             tbl-root-coll-type (keyword table-name "root_collection_type")
             gate-id            (keyword gate-table "id")
             gate-doc-root      [:->> (keyword gate-table "document") [:inline "root_collection_type"]]
             composite-gate-id  [:|| tbl-model [:inline "_"] tbl-model-id]]
         (execute! {:alter-table [kw-tbl] :add-column [[:root_collection_type :text :if-not-exists]]})
         ;; Per-row backfill: take whatever the gate document says — authoritative when present.
         (execute! {:update kw-tbl
                    :from   [kw-gate]
                    :set    {:root_collection_type gate-doc-root}
                    :where  [:and
                             [:= gate-id composite-gate-id]
                             [:= tbl-root-coll-type nil]
                             [:!= gate-doc-root nil]]})
         ;; Forest backfill: one UPDATE per distinct root type, filling rows the gate doc missed.
         (doseq [[root-type entries] (group-by val root-type-by-coll-id)]
           (execute! {:update kw-tbl
                      :set    {:root_collection_type [:inline root-type]}
                      :where  [:and
                               [:= :root_collection_type nil]
                               [:in :collection_id (mapv key entries)]]})))))))

(defn- table-curation-by-id
  "Map `table-id → {:data_authority .. :curated ..}` from the appdb, for backfilling semantic-index rows
  whose curation depends on table columns the index lacks (`is_published`, `data_authority`). Returns `{}`
  and logs if the appdb lookup fails (e.g. tests exercising pgvector before the appdb schema is up)."
  []
  (try
    (u/for-map [{:keys [id is_published data_layer data_authority]}
                (t2/select [:model/Table :id :is_published :data_layer :data_authority])]
      ;; data_layer/data_authority read back as keywords; curated? normalizes them, but the index column is
      ;; text so store data_authority as a string for the [:inline ...] backfill below.
      [id {:data_authority (some-> data_authority name)
           :curated        (collections.curation/curated?
                            {:model          "table"
                             :is_published   is_published
                             :data_layer     data_layer
                             :data_authority data_authority})}])
    (catch Exception e
      (log/warn e "Skipping semantic table curation backfill — appdb lookup failed")
      {})))

(defn- add-data-authority-and-curated-columns!
  "Migration 5: add `data_authority` and the precomputed `curated` flag to index tables.
  `curated` backs Metabot's \"verified or curated content\" filter.
  Non-table rows compute `curated` from index columns via [[metabase.collections.curation/curated-honeysql]]
  (the index has no `is_published`; library metrics/segments ride `root_collection_type`). Table rows also
  need `is_published` + `data_authority`, which the index lacks, so they are backfilled from the appdb and
  their `curated` computed there — keeping existing published/authoritative tables correct without a
  re-index. Changing the rule needs a new migration to recompute this column."
  [tx index-metadata]
  (let [;; is_published is a table concept; forcing it false here only affects non-tables, which is correct
        ;; (they're covered by root_collection_type). Tables are corrected from the appdb below.
        curated-expr   (collections.curation/curated-honeysql
                        (fn [signal] (if (= signal :is_published) [:inline false] signal)))
        table-curation (table-curation-by-id)]
    (alter-index-tables!
     tx index-metadata 5
     (fn [execute! table-name]
       (let [kw-tbl (keyword table-name)]
         (execute! {:alter-table [kw-tbl] :add-column [[:data_authority :text :if-not-exists]]})
         (execute! {:alter-table [kw-tbl] :add-column [[:curated :boolean :if-not-exists]]})
         (if (seq table-curation)
           (do
             ;; Non-table rows: compute from index columns.
             (execute! {:update kw-tbl
                        :set   {:curated curated-expr}
                        :where [:and [:= :curated nil] [:!= :model [:inline "table"]]]})
             ;; Table rows: backfill data_authority and curated from the appdb, grouped by value so the
             ;; statement count stays bounded regardless of how many tables exist.
             (doseq [[authority entries] (->> table-curation
                                              (filter (comp some? :data_authority val))
                                              (group-by (comp :data_authority val)))]
               (execute! {:update kw-tbl
                          :set    {:data_authority [:inline authority]}
                          :where  [:and [:= :model [:inline "table"]]
                                   [:in :model_id (mapv (comp str key) entries)]]}))
             (doseq [[curated? entries] (group-by (comp :curated val) table-curation)]
               (execute! {:update kw-tbl
                          :set    {:curated curated?}
                          :where  [:and [:= :model [:inline "table"]]
                                   [:in :model_id (mapv (comp str key) entries)]]})))
           ;; appdb unavailable: fall back to the index-column computation for every row. Tables curated
           ;; solely by is_published/data_authority stay false until the next reindex, which self-heals.
           (execute! {:update kw-tbl
                      :set   {:curated curated-expr}
                      :where [:= :curated nil]})))))))

(defn migrate-dynamic-schema!
  "Migrate runtime-managed schema, ie. schema of `index_table_...` tables. Migration author is responsible for removing
  leftovers if necessary."
  [tx {:keys [index-metadata] :as _opts}]
  ;; migration 1: all tables dropped in schema migration in single function call
  ;; migration 2: add personal_owner_id column to index tables
  ;; migration 3: add collection_type and data_layer columns to index tables
  ;; migration 4: add root_collection_type column to index tables
  ;; migration 5: add data_authority and precomputed curated columns to index tables
  (add-personal-owner-id-column! tx index-metadata)
  (add-collection-type-and-data-layer-columns! tx index-metadata)
  (add-root-collection-type-column! tx index-metadata)
  (add-data-authority-and-curated-columns! tx index-metadata))
