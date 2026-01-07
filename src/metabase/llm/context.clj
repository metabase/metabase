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
   Returns sequence of column maps with :name and :database_type."
  [mp table-id]
  (when-let [table-meta (lib.metadata/table mp table-id)]
    (let [table-query (lib/query mp table-meta)
          columns (lib/visible-columns table-query)]
      (mapv (fn [col]
              {:name          (:name col)
               :database_type (or (:database-type col)
                                  (some-> (:base-type col) name))})
            columns))))

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
  [{:keys [^String database_type], col-name :name} ^Writer writer]
  (format-escaped col-name writer)
  (.append writer " ")
  (.append writer (or database_type "UNKNOWN")))

(defn- format-table-ddl
  [{:keys [schema columns], table-name :name} ^Writer writer]
  (.append writer "CREATE TABLE ")
  (when (seq schema)
    (format-escaped schema writer)
    (.append writer \.))
  (format-escaped table-name writer)
  (.append writer " (")
  (when (seq columns)
    (.append writer "\n  ")
    (format-column-ddl (first columns) writer)
    (doseq [column (rest columns)]
      (.append writer ",\n  ")
      (format-column-ddl column writer)))
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

(defn build-schema-context
  "Fetch table metadata for mentioned tables and format as DDL for LLM context.

   Uses the metadata provider to get visible columns, respecting field
   visibility settings. Returns nil if no valid tables found.

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
                          {:name    (:name table)
                           :schema  (:schema table)
                           :columns columns}))
                      accessible-tables)]
            (when (seq tables-with-columns)
              (format-schema-ddl tables-with-columns))))))))
