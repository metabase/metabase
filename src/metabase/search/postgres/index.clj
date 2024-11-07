(ns metabase.search.postgres.index
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private active-table :search_index)

(def ^:private pending-table :search_index_next)

(def ^:private retired-table :search_index_retired)

(defonce ^:private initialized? (atom false))

(defonce ^:private reindexing? (atom false))

(def ^:private tsv-language "simple")

(defn- exists? [table-name]
  (t2/exists? :information_schema.tables :table_name (name table-name)))

(defn- drop-table! [table-name]
  (boolean
   (when (exists? table-name)
     (t2/query (sql.helpers/drop-table table-name)))))

(defn- rename-table! [old new]
  (when (and (exists? old) (not (exists? new)))
    (-> (sql.helpers/alter-table old)
        (sql.helpers/rename-table new)
        t2/query)))

(defn maybe-create-pending!
  "Create a non-active search index table."
  []
  (when (not @reindexing?)
    (when-not (exists? pending-table)
      (-> (sql.helpers/create-table pending-table)
          (sql.helpers/with-columns
            [[:id :bigint [:primary-key] [:raw "GENERATED BY DEFAULT AS IDENTITY"]]
             ;; entity
             [:model_id :int :not-null]
             [:model [:varchar 254] :not-null] ;; TODO We could shrink this to just what we need.
             ;; search
             [:search_vector :tsvector :not-null]
             ;; results
             [:display_data :text :not-null]
             [:legacy_input :text :not-null]
             ;; scoring related
             [:dashboardcard_count :int]
             [:model_rank :int :not-null]
             [:pinned :boolean]
             [:verified :boolean]
             ;; permission related entities
             [:collection_id :int]
             [:database_id :int]
             ;; leaving as just text for now, but perhaps we want it to be JSON, and have a tsvector field too
             [:dataset_query :text]
             [:table_id :int]
             ;; filter related
             [:archived :boolean :not-null [:default false]]
             [:creator_id :int]
             [:last_edited_at :timestamp]
             [:last_editor_id :int]
             [:model_created_at :timestamp]
             [:model_updated_at :timestamp]
             ;; useful for tracking the speed and age of the index
             [:created_at :timestamp
              [:default [:raw "CURRENT_TIMESTAMP"]]
              :not-null]])
          t2/query)

      ;; TODO I strongly suspect that there are more indexes that would help performance, we should examine EXPLAIN.

      (let [idx_prefix (str/replace (str (name active-table) "_" (random-uuid)) #"-" "_")
            table-name (name pending-table)]
        (t2/query
         (format "CREATE UNIQUE INDEX IF NOT EXISTS %s_identity_idx ON %s (model, model_id)" idx_prefix table-name))
        (t2/query
         (format "CREATE INDEX IF NOT EXISTS %s_tsvector_idx ON %s USING gin (search_vector)" idx_prefix table-name))))

    (reset! reindexing? true)))

(defn activate-pending!
  "Make the pending index active if it exists. Returns true if it did so."
  []
  ;; ... just in case it wasn't cleaned up last time.
  (drop-table! retired-table)
  (when (exists? pending-table)
    (t2/with-transaction [_conn]
      (rename-table! active-table retired-table)
      (rename-table! pending-table active-table))
    (reset! reindexing? false)
    (drop-table! retired-table)
    true))

(defn- entity->entry [entity]
  (-> entity
      (select-keys
       ;; remove attrs that get aliased
       (remove #{:id :created_at :updated_at}
               (conj search.spec/attr-columns
                     :model :model_rank
                     :display_data :legacy_input)))
      (update :display_data json/generate-string)
      (update :legacy_input json/generate-string)
      (assoc
       :model_id         (:id entity)
       :model_created_at (:created_at entity)
       :model_updated_at (:updated_at entity)
       :search_vector    [:to_tsvector
                          [:inline tsv-language]
                          [:cast
                           (:searchable_text entity)
                           :text]])))

(defn- upsert! [table entry]
  (t2/query
   {:insert-into   table
    :values        [entry]
    :on-conflict   [:model :model_id]
    :do-update-set entry}))

(defn- batch-upsert! [table entries]
  (when (seq entries)
    (t2/query
     ;; The cost of dynamically calculating these keys should be small compared to the IO cost, so unoptimized.
     (let [update-keys (vec (disj (set (keys (first entries))) :id :model :model_id))
           excluded-kw (fn [column] (keyword (str "excluded." (name column))))]
       {:insert-into   table
        :values        entries
        :on-conflict   [:model :model_id]
        :do-update-set (zipmap update-keys (map excluded-kw update-keys))}))))

(defn update!
  "Create the given search index entries"
  [entity]
  (let [entry (entity->entry entity)]
    (when @initialized?
      (upsert! active-table entry))
    (when @reindexing?
      (upsert! pending-table entry))))

(defn delete!
  "Remove any entries corresponding directly to a given model instance."
  [id search-models]
  ;; In practice, we expect this to be 1-1, but the data model does not preclude it.
  (when (seq search-models)
    (when @initialized?
      (t2/delete! active-table :model_id id :model [:in search-models]))
    (when @reindexing?
      (t2/delete! pending-table :model_id id :model [:in search-models]))))

(defn- quote* [s]
  (str "'" (str/replace s "'" "''") "'"))

(defn- process-phrase [word-or-phrase]
  ;; a phrase is quoted even if the closing quotation mark has not been typed yet
  (cond
    ;; quoted phrases must be matched sequentially
    (str/starts-with? word-or-phrase "\"")
    (as-> word-or-phrase <>
      ;; remove the quote mark(s)
      (str/replace <> #"^\"|\"$" "")
      (str/trim <>)
      (str/split <> #"\s+")
      (map quote* <>)
      (str/join " <-> " <>))

    ;; negation
    (str/starts-with? word-or-phrase "-")
    (str "!" (quote* (subs word-or-phrase 1)))

    ;; just a regular word
    :else
    (quote* word-or-phrase)))

(defn- split-preserving-quotes
  "Break up the words in the search input, preserving quoted and partially quoted segments."
  [s]
  (re-seq #"\"[^\"]*(?:\"|$)|[^\s\"]+|\s+" (u/lower-case-en s)))

(defn- process-clause [words-and-phrases]
  (->> words-and-phrases
       (remove #{"and"})
       (map process-phrase)
       (str/join " & ")))

(defn- complete-last-word
  "Add wildcards at the end of the final word, so that we match ts completions."
  [expression]
  (str/replace expression #"(\S+)(?=\s*$)" "$1:*"))

(defn- to-tsquery-expr
  "Given the user input, construct a query in the Postgres tsvector query language."
  [input]
  (let [trimmed        (str/trim input)
        complete?      (not (str/ends-with? trimmed "\""))
        ;; TODO also only complete if search-typeahead-enabled and the context is the search palette
        maybe-complete (if complete? complete-last-word identity)]
    (->> (split-preserving-quotes trimmed)
         (remove str/blank?)
         (partition-by #{"or"})
         (remove #(= (first %) "or"))
         (map process-clause)
         (str/join " | ")
         maybe-complete)))

(defn batch-update!
  "Create the given search index entries in bulk"
  [entities]
  (let [entries (map entity->entry entities)]
    (when @initialized?
      (batch-upsert! active-table entries))
    (when @reindexing?
      (batch-upsert! pending-table entries))))

(defn search-query
  "Query fragment for all models corresponding to a query parameter `:search-term`."
  ([search-term]
   (search-query search-term [:model_id :model]))
  ([search-term select-items]
   {:select select-items
    :from   [active-table]
    :where  (if-not search-term
              [:= [:inline 1] [:inline 1]]
              [:raw
               "search_vector @@ to_tsquery('"
               tsv-language "', "
               [:lift (to-tsquery-expr search-term)] ")"])}))

(defn search
  "Use the index table to search for records."
  [search-term]
  (map (juxt :model_id :model)
       (t2/query (search-query search-term))))

(defn reset-index!
  "Ensure we have a blank slate; in case the table schema or stored data format has changed."
  []
  (reset! reindexing? false)
  (drop-table! pending-table)
  (maybe-create-pending!)
  (activate-pending!)
  (reset! initialized? true))

(defn ensure-ready!
  "Ensure the index is ready to be populated. Return false if it was already ready."
  [force-recreation?]
  (if (or force-recreation? (not (exists? active-table)))
    (reset-index!)
    (reset! initialized? true)))
