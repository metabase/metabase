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
   Returns sequence of column maps with metadata for DDL generation."
  [mp table-id]
  (when-let [table-meta (lib.metadata/table mp table-id)]
    (let [table-query (lib/query mp table-meta)
          columns (lib/visible-columns table-query)]
      (mapv (fn [col]
              {:id                  (:id col)
               :name                (:name col)
               :database_type       (or (:database-type col)
                                        (some-> (:base-type col) name))
               :description         (:description col)
               :semantic_type       (:semantic-type col)
               :fingerprint         (:fingerprint col)
               :fk_target_field_id  (:fk-target-field-id col)})
            columns))))

(defn- fetch-field-values
  "Fetch cached FieldValues for columns that have them.
   Returns map of field-id -> values vector."
  [columns]
  (let [field-ids (->> columns
                       (keep :id)
                       (filter pos-int?))]
    (when (seq field-ids)
      (let [fv-map (field-values/batched-get-latest-full-field-values field-ids)]
        (into {}
              (keep (fn [[field-id fv]]
                      (when-let [values (not-empty (:values fv))]
                        [field-id values])))
              fv-map)))))

(defn- fetch-fk-targets
  "Fetch table.field names for FK target fields.
   Returns map of target-field-id -> {:table name :field name}"
  [columns]
  (let [target-ids (->> columns
                        (keep :fk_target_field_id)
                        set)]
    (when (seq target-ids)
      (into {}
            (map (fn [{:keys [id name table_id]}]
                   (let [table-name (t2/select-one-fn :name :model/Table :id table_id)]
                     [id {:table table-name :field name}])))
            (t2/select [:model/Field :id :name :table_id]
                       :id [:in target-ids])))))

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
        parts (cond-> []
                ;; User-provided description takes priority
                (not-empty description)
                (conj description)

                ;; FK relationship
                (and fk_target_field_id fk-target-info)
                (conj (str "FK->" (:table fk-target-info) "." (:field fk-target-info)))

                ;; Sample values for low-cardinality fields
                has-sample-values?
                (conj (str/join ", " (map truncate-value field-values)))

                ;; Semantic type hints (when no description and no sample values)
                (and (nil? description) (not has-sample-values?) semantic_type)
                (conj (case semantic_type
                        :type/PK       "PK"
                        :type/FK       "FK"
                        :type/Email    "email"
                        :type/URL      "URL"
                        :type/Category "category"
                        :type/Currency "currency"
                        nil)))

        ;; Add fingerprint stats
        fp-type (some-> fingerprint :type vals first)

        stats-parts (cond-> []
                      ;; Numeric range
                      (and (:min fp-type) (:max fp-type))
                      (conj (format-numeric-stats fp-type))

                      ;; Temporal range
                      (and (:earliest fp-type) (:latest fp-type))
                      (conj (format-temporal-stats fp-type)))

        all-parts (concat parts (remove nil? stats-parts))]
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

(defn build-schema-context
  "Fetch table metadata for mentioned tables and format as DDL for LLM context.

   Uses the metadata provider to get visible columns, respecting field
   visibility settings. Includes field descriptions, sample values, and
   statistical information when available.

   Parameters:
   - database-id: Database containing the tables
   - table-ids: Set of table IDs to include

   Returns a string containing CREATE TABLE statements, or nil."
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
                          {:name        (:name table)
                           :schema      (:schema table)
                           :description (:description table)
                           :columns     columns}))
                      accessible-tables)

                ;; Gather all columns for batch operations
                all-columns (mapcat :columns tables-with-columns)

                ;; Batch fetch FieldValues and FK targets
                field-values-map (fetch-field-values all-columns)
                fk-targets-map   (fetch-fk-targets all-columns)

                ;; Enrich columns with comments
                enriched-tables
                (mapv (fn [table]
                        (update table :columns
                                enrich-columns-with-comments
                                field-values-map
                                fk-targets-map))
                      tables-with-columns)]

            (when (seq enriched-tables)
              (format-schema-ddl enriched-tables))))))))
