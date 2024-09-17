(ns metabase.search.postgres.index
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private active-table :search_index)

(def ^:private pending-table :search_index_next)

(def ^:private retired-table :search_index_retired)

(defonce ^:private initialized? (atom false))

(defonce ^:private reindexing? (atom false))

(def ^:private tsv-language "english")

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
             [:model [:varchar 254] :not-null] ;; TODO find the right size
             ;; search
             [:search_vector :tsvector :not-null]
             ;; scoring related
             [:model_rank :int :not-null]
             ;; permission related entities
             [:collection_id :int]
             [:database_id :int]
             [:table_id :int]
             ;; filter related
             [:archived :boolean]
             ;; useful for tracking the speed and age of the index
             [:created_at :timestamp
              [:default [:raw "CURRENT_TIMESTAMP"]]
              :not-null]])

          t2/query)

      (t2/query
       (format "CREATE INDEX IF NOT EXISTS %s_tsvector_idx ON %s USING gin (search_vector)"
               (str/replace (str (name active-table) "_" (random-uuid)) #"-" "_")
               (name pending-table))))
    (reset! reindexing? true)))

(defn activate-pending!
  "Make the pending index active, if it exists. Returns true if it did so."
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
       [:model
        :model_rank
        :collection_id
        :database_id
        :table_id
        :archived])
      (assoc
       :model_id      (:id entity)
       :search_vector [:to_tsvector
                       [:inline tsv-language]
                       [:cast
                        (:searchable_text entity)
                        :text]])))

(defn update!
  "Create the given search index entries"
  [entity]
  (let [entry (entity->entry entity)]
    (when @initialized?
      (t2/insert! active-table entry))
    (when @reindexing?
      (t2/insert! pending-table entry))))

(defn- process-negation [term]
  (if (str/starts-with? term "-")
    (str "!" (subs term 1))
    term))

(defn- process-phrase [word-or-phrase]
  ;; a phrase is quoted even if the closing quotation mark has not been typed yet
  (if (str/starts-with? word-or-phrase "\"")
    ;; quoted phrases must be matched sequentially
    (as-> word-or-phrase <>
      ;; remove the quote mark(s)
      (str/replace <> #"^\"|\"$" "")
      (str/trim <>)
      (str/split <> #"\s+")
      (str/join " <-> " <>))
    ;; just a regular word
    word-or-phrase))

(defn- split-preserving-quotes
  "Break up the words in the search input, preserving quoted and partially quoted segments."
  [s]
  (re-seq #"\"[^\"]*(?:\"|$)|[^\s\"]+|\s+" (u/lower-case-en s)))

(defn- process-clause [words-and-phrases]
  (->> words-and-phrases
       (remove #{"and"})
       (map (comp process-phrase
                  process-negation))
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
      (t2/insert! active-table entries))
    (when @reindexing?
      (t2/insert! pending-table entries))))

(defn search-query
  "Query fragment for all models corresponding to a query paramter `:search-term`."
  [search-term]
  {:select [:model_id :model]
   :from   [active-table]
   :where  [:raw
            "search_vector @@ to_tsquery('"
            tsv-language "', "
            [:lift (to-tsquery-expr search-term)] ")"]})

(defn search
  "Use the index table to search for records."
  [search-term]
  (map (juxt :model_id :model)
       (t2/query (search-query search-term))))

(defn reset-index!
  "Ensure we have a blank slate, in case the table schema or stored data format has changed."
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
