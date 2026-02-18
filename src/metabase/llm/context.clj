(ns metabase.llm.context
  "Schema extraction for LLM context. Parses table mentions from prompts
   and fetches table metadata formatted as DDL for SQL generation."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2])
  (:import
   (java.io StringWriter Writer)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Mention Parsing ------------------------------------------------

(def ^:private table-mention-pattern
  "Regex to extract table IDs from markdown-style metabase:// links.
   Frontend serializes @mentions as: [Display Name](metabase://table/123)"
  #"\[[^\]]+\]\(metabase://table/(\d+)\)")

(defn parse-table-mentions
  "Extract table IDs from metabase://table/{id} links in prompt text.

   Frontend serializes @mentions as markdown links:
   [Display Name](metabase://table/123)

   Returns a set of table IDs (integers), or nil if input is nil."
  [prompt-text]
  (when (string? prompt-text)
    (->> (re-seq table-mention-pattern prompt-text)
         (keep (fn [[_ id-str]]
                 (parse-long id-str)))
         set)))

(defn- table-match-clause
  "Build a WHERE clause to match a table by name and optionally schema.
   When schema is present, matches both; otherwise matches just the table name."
  [{:keys [schema table]}]
  (let [table-lower (u/lower-case-en table)]
    (if schema
      [:and
       [:= [:lower :name] table-lower]
       [:= [:lower :schema] (u/lower-case-en schema)]]
      [:= [:lower :name] table-lower])))

(defn extract-tables-from-sql
  "Extract table IDs from a raw SQL string.

   Parses the SQL to identify referenced table names, then queries the
   database to resolve those names to table IDs. When the SQL includes
   schema-qualified references (e.g., schema.table), matches on both
   schema and table name.

   Returns a set of table IDs (integers), or empty set if parsing fails
   or no tables are found."
  [database-id sql-string]
  (if (and database-id (seq sql-string))
    (try
      (let [driver (t2/select-one-fn :engine :model/Database :id database-id)
            tables (sql-tools/referenced-tables-raw driver sql-string)]
        (if (seq tables)
          (let [match-clauses (mapv table-match-clause tables)
                matched-tables (t2/select :model/Table
                                          {:where [:and
                                                   [:= :db_id database-id]
                                                   [:= :active true]
                                                   (into [:or] match-clauses)]})]
            (into #{} (map :id) matched-tables))
          #{}))
      (catch Exception e
        (log/warn e "Failed to extract tables from source SQL")
        #{}))
    #{}))

;;; ------------------------------------------ Permission-Filtered Fetch ------------------------------------------

(defn- fetch-accessible-tables
  "Fetch tables by ID, filtering to only those the current user can access.
   Returns a map of table-id -> table record."
  [table-ids]
  (when (seq table-ids)
    (let [{:keys [clause with]} (mi/visible-filter-clause
                                 :model/Table :id
                                 {:user-id       api/*current-user-id*
                                  :is-superuser? api/*is-superuser?*}
                                 {:perms/view-data      :unrestricted
                                  :perms/create-queries :query-builder-and-native})
          tables (t2/select :model/Table
                            :id [:in table-ids]
                            :active true
                            :visibility_type nil
                            (cond-> {:where clause}
                              with (assoc :with with)))]
      (into {} (map (juxt :id identity)) tables))))

;;; ----------------------------------------- Metadata Provider Column Fetch -----------------------------------------

(defn- fetch-table-columns
  "Use metadata provider to get visible columns for a table.
   Returns sequence of column maps with metadata for DDL generation.
   By default excludes implicitly-joinable columns; pass opts to override."
  ([mp table-id]
   (fetch-table-columns mp table-id {}))
  ([mp table-id opts]
   (when-let [table-meta (lib.metadata/table mp table-id)]
     (let [table-query (lib/query mp table-meta)
           vis-opts    (merge {:include-implicitly-joinable? false} opts)
           columns     (lib/visible-columns table-query -1 vis-opts)]
       (mapv (fn [col]
               {:id                  (:id col)
                :name                (:name col)
                :database_type       (or (:database-type col)
                                         (some-> (:base-type col) name))
                :description         (:description col)
                :semantic_type       (:semantic-type col)
                :fingerprint         (:fingerprint col)
                :fk_target_field_id  (:fk-target-field-id col)})
             columns)))))

(defn- fetch-field-values
  "Fetch or create FieldValues for columns that should have them.
   Uses get-or-create-full-field-values! which will:
   - Create field values if missing and field should have them
   - Update field values if inactive (not used recently)
   - Query source database if necessary to populate values
   Returns map of field-id -> values vector."
  [columns]
  (let [field-ids (->> columns
                       (keep :id)
                       (filter pos-int?)
                       set)]
    (when (seq field-ids)
      (let [fields (t2/select :model/Field :id [:in field-ids])]
        (into {}
              (keep (fn [field]
                      (when-let [fv (field-values/get-or-create-full-field-values! field)]
                        (when-let [values (not-empty (:values fv))]
                          [(:id field) values]))))
              fields)))))

(defn- fetch-fk-targets
  "Fetch table.field names for FK target fields.
   Returns map of target-field-id -> {:table name :field name}"
  [columns]
  (let [target-ids (->> columns
                        (keep :fk_target_field_id)
                        set)]
    (when (seq target-ids)
      (let [fields      (t2/select [:model/Field :id :name :table_id]
                                   :id [:in target-ids])
            table-ids   (into #{} (map :table_id) fields)
            table-names (when (seq table-ids)
                          (t2/select-pk->fn :name :model/Table :id [:in table-ids]))]
        (into {}
              (map (fn [{:keys [id name table_id]}]
                     [id {:table (get table-names table_id) :field name}]))
              fields)))))

;;; ----------------------------------------- On-Demand Metadata Enrichment -----------------------------------------

(defn- enrich-fingerprints-on-demand!
  "For columns missing fingerprints, trigger re-fingerprinting.
   Returns a map of field-id -> fingerprint for columns that were missing them.
   This queries the source database to compute fingerprints if they don't exist."
  [columns]
  (let [missing-fp-ids (->> columns
                            (filter #(and (:id %) (nil? (:fingerprint %))))
                            (map :id)
                            (filter pos-int?)
                            set)]
    (when (seq missing-fp-ids)
      (let [fields (t2/select :model/Field :id [:in missing-fp-ids])]
        (doseq [field fields]
          (sync/refingerprint-field! field))
        (t2/select-pk->fn :fingerprint :model/Field :id [:in missing-fp-ids])))))

;;; ------------------------------------------- Fingerprint Formatting -------------------------------------------

(defn- format-numeric-stats
  "Format numeric fingerprint as readable string."
  [{:keys [min max avg]}]
  (when (and min max)
    (let [fmt #(if (integer? %) (str %) (format "%.2f" (double %)))]
      (cond-> (str "range: " (fmt min) "-" (fmt max))
        avg (str ", avg: " (fmt avg))))))

(defn- format-temporal-stats
  "Format temporal fingerprint as readable string."
  [{:keys [earliest latest]}]
  (when (and earliest latest)
    (let [fmt-date #(some-> % (subs 0 (min 10 (count %))))]
      (str (fmt-date earliest) " to " (fmt-date latest)))))

(defn- format-text-stats
  "Format text fingerprint as readable string.
   Includes average-length from type fingerprint and distinct-count/nil% from global."
  [type-fp global-fp]
  (let [{:keys [average-length]} type-fp
        {:keys [distinct-count nil%]} global-fp
        parts (cond-> []
                distinct-count
                (conj (str "distinct: " distinct-count))

                (and nil% (pos? nil%))
                (conj (str "nil: " (format "%.0f%%" (* 100 nil%))))

                (and average-length (> average-length 0))
                (conj (str "avg-len: " (format "%.0f" (double average-length)))))]
    (when (seq parts)
      (str/join ", " parts))))

(defn- semantic-type->hint
  "Extract the type name from a semantic type keyword for DDL comments.
   e.g. :type/Email -> \"Email\", :type/CreationTimestamp -> \"CreationTimestamp\"
   Returns nil if semantic-type is nil."
  [semantic-type]
  (some-> semantic-type name))

;;; -------------------------------------------- Column Comment Building --------------------------------------------

(def ^:private max-sample-values 6)
(def ^:private max-sample-value-length 30)

(defn- truncate-value
  "Truncate a sample value if too long."
  [v]
  (let [s (str v)]
    (if (> (count s) max-sample-value-length)
      (str (subs s 0 (- max-sample-value-length 3)) "...")
      s)))

(defn- build-column-comment
  "Build an informative comment for a column based on available metadata.
   Returns nil if no useful metadata is available."
  [{:keys [description semantic_type fingerprint fk_target_field_id]}
   field-values
   fk-target-info]
  (let [has-sample-values? (and (not-empty field-values)
                                (<= (count field-values) max-sample-values))
        fp-global (get fingerprint :global)
        fp-type   (some-> fingerprint :type vals first)

        parts (cond-> []
                ;; User-provided description takes priority
                (not-empty description)
                (conj description)

                ;; FK relationship
                (and fk_target_field_id fk-target-info)
                (conj (str "FK->" (:table fk-target-info) "." (:field fk-target-info))))

        ;; Sample values for low-cardinality fields
        parts (if has-sample-values?
                (conj parts (str/join ", " (map truncate-value field-values)))
                ;; Semantic type hint only when no description and no sample values
                (if-let [sem-hint (and (nil? description)
                                       semantic_type
                                       (semantic-type->hint semantic_type))]
                  (conj parts sem-hint)
                  parts))

        ;; Fingerprint stats based on field type
        stats (cond
                ;; Numeric range
                (and (:min fp-type) (:max fp-type))
                (format-numeric-stats fp-type)

                ;; Temporal range
                (and (:earliest fp-type) (:latest fp-type))
                (format-temporal-stats fp-type)

                ;; Text stats (distinct count, nil%, avg length)
                (or (:average-length fp-type) (:distinct-count fp-global))
                (format-text-stats fp-type fp-global))

        all-parts (cond-> parts
                    stats (conj stats))]
    (when (seq all-parts)
      (str/join "; " all-parts))))

;;; ------------------------------------------------ DDL Formatting ------------------------------------------------

(defn- format-escaped
  "Escape identifier if it contains special characters."
  [^String identifier ^Writer writer]
  (if (re-matches #"[\p{Alpha}_][\p{Alnum}_]*" identifier)
    (.append writer identifier)
    (do
      (.append writer \")
      (doseq [^Character c identifier]
        (when (= c \")
          (.append writer c))
        (.append writer c))
      (.append writer \"))))

(defn- format-column-ddl
  "Format a single column definition. If column has a :comment, emit it as a SQL comment
   on the line before the column definition."
  [{:keys [^String database_type ^String comment], col-name :name} ^Writer writer first?]
  (when comment
    (when-not first?
      (.append writer "\n"))
    (.append writer "  -- ")
    (.append writer comment)
    (.append writer "\n"))
  (when-not (or first? comment)
    (.append writer "\n"))
  (.append writer "  ")
  (format-escaped col-name writer)
  (.append writer " ")
  (.append writer (or database_type "UNKNOWN")))

(defn- format-table-ddl
  [{:keys [schema columns description], table-name :name} ^Writer writer]
  (when (not-empty description)
    (.append writer "-- ")
    (.append writer ^String description)
    (.append writer "\n"))
  (.append writer "CREATE TABLE ")
  (when (seq schema)
    (format-escaped schema writer)
    (.append writer \.))
  (format-escaped table-name writer)
  (.append writer " (")
  (when (seq columns)
    (.append writer "\n")
    (format-column-ddl (first columns) writer true)
    (doseq [column (rest columns)]
      (.append writer ",")
      (format-column-ddl column writer false)))
  (.append writer "\n);"))

(defn- format-schema-ddl
  "Format multiple tables as DDL string."
  [tables]
  (let [sw (StringWriter.)]
    (doseq [table tables]
      (format-table-ddl table sw)
      (.append sw \newline))
    (str/trimr (str sw))))

;;; ------------------------------------------------- Public API -------------------------------------------------

(defn- enrich-columns-with-comments
  "Add :comment to each column based on available metadata."
  [columns field-values-map fk-targets-map]
  (mapv (fn [col]
          (let [fv      (get field-values-map (:id col))
                fk-info (get fk-targets-map (:fk_target_field_id col))
                comment (build-column-comment col fv fk-info)]
            (cond-> col
              comment (assoc :comment comment))))
        columns))

(defn- merge-enriched-fingerprints
  "Merge on-demand fingerprints into columns that were missing them."
  [columns enriched-fp-map]
  (if (seq enriched-fp-map)
    (mapv (fn [col]
            (if (and (nil? (:fingerprint col))
                     (contains? enriched-fp-map (:id col)))
              (assoc col :fingerprint (get enriched-fp-map (:id col)))
              col))
          columns)
    columns))

(defn- format-columns-for-response
  "Format columns for API response, resolving FK targets."
  [columns fk-targets-map]
  (mapv (fn [col]
          (let [fk-info (get fk-targets-map (:fk_target_field_id col))]
            (cond-> {:id            (:id col)
                     :name          (:name col)
                     :database_type (:database_type col)
                     :description   (:description col)
                     :semantic_type (some-> (:semantic_type col) name)}
              fk-info (assoc :fk_target {:table_name (:table fk-info)
                                         :field_name (:field fk-info)}))))
        columns))

(defn build-schema-context
  "Fetch table metadata for mentioned tables and format as DDL for LLM context.

   Uses the metadata provider to get visible columns, respecting field
   visibility settings. Includes field descriptions, sample values, and
   statistical information when available.

   For fields missing fingerprints or field values, this function will
   trigger on-demand creation by querying the source database.

   Parameters:
   - database-id: Database containing the tables
   - table-ids: Set of table IDs to include

   Returns a map with:
   - :ddl - DDL string for LLM context
   - :tables - structured table metadata for API response
   Or nil if no accessible tables found."
  [database-id table-ids]
  (when (and database-id (seq table-ids))
    (let [accessible-tables (fetch-accessible-tables table-ids)]
      (when (seq accessible-tables)
        (lib-be/with-metadata-provider-cache
          (let [mp (lib-be/application-database-metadata-provider database-id)
                _ (lib.metadata/bulk-metadata mp :metadata/table (keys accessible-tables))

                tables-with-columns
                (keep (fn [[table-id table]]
                        (when-let [columns (seq (fetch-table-columns mp table-id))]
                          {:id           table-id
                           :name         (:name table)
                           :schema       (:schema table)
                           :display_name (:display_name table)
                           :description  (:description table)
                           :columns      columns}))
                      accessible-tables)

                ;; Gather all columns for batch operations
                all-columns (mapcat :columns tables-with-columns)

                ;; On-demand enrichment: trigger fingerprinting for columns missing fingerprints
                enriched-fp-map (enrich-fingerprints-on-demand! all-columns)

                ;; Update tables with enriched fingerprints
                tables-with-enriched-fps
                (mapv (fn [table]
                        (update table :columns merge-enriched-fingerprints enriched-fp-map))
                      tables-with-columns)

                ;; Re-gather columns after fingerprint enrichment
                all-enriched-columns (mapcat :columns tables-with-enriched-fps)

                ;; Batch fetch FieldValues (on-demand) and FK targets
                field-values-map (fetch-field-values all-enriched-columns)
                fk-targets-map   (fetch-fk-targets all-enriched-columns)

                ;; Enrich columns with comments for DDL
                enriched-tables
                (mapv (fn [table]
                        (update table :columns
                                enrich-columns-with-comments
                                field-values-map
                                fk-targets-map))
                      tables-with-enriched-fps)

                ;; Format tables for API response (without :comment, with :fk_target)
                response-tables
                (mapv (fn [table]
                        (update table :columns format-columns-for-response fk-targets-map))
                      tables-with-enriched-fps)]

            (when (seq enriched-tables)
              {:ddl    (format-schema-ddl enriched-tables)
               :tables response-tables})))))))

(defn get-tables-with-columns
  "Fetch tables with their columns for the extract-tables endpoint.
   Returns lightweight metadata without triggering fingerprinting or field values.

   Parameters:
   - database-id: Database containing the tables
   - table-ids: Set of table IDs to include

   Returns a vector of table maps with :id, :name, :schema, :display_name,
   :description, and :columns (with FK targets resolved), or nil."
  [database-id table-ids]
  (when (and database-id (seq table-ids))
    (let [accessible-tables (fetch-accessible-tables table-ids)]
      (when (seq accessible-tables)
        (lib-be/with-metadata-provider-cache
          (let [mp (lib-be/application-database-metadata-provider database-id)
                _ (lib.metadata/bulk-metadata mp :metadata/table (keys accessible-tables))

                tables-with-columns
                (keep (fn [[table-id table]]
                        (when-let [columns (seq (fetch-table-columns mp table-id))]
                          {:id           table-id
                           :name         (:name table)
                           :schema       (:schema table)
                           :display_name (:display_name table)
                           :description  (:description table)
                           :columns      columns}))
                      accessible-tables)

                all-columns    (mapcat :columns tables-with-columns)
                fk-targets-map (fetch-fk-targets all-columns)]

            (mapv (fn [table]
                    (update table :columns
                            (fn [cols]
                              (mapv (fn [col]
                                      (let [fk-info (get fk-targets-map (:fk_target_field_id col))]
                                        (cond-> {:id            (:id col)
                                                 :name          (:name col)
                                                 :database_type (:database_type col)
                                                 :description   (:description col)
                                                 :semantic_type (some-> (:semantic_type col) name)}
                                          fk-info (assoc :fk_target {:table_name (:table fk-info)
                                                                     :field_name (:field fk-info)}))))
                                    cols))))
                  tables-with-columns)))))))
