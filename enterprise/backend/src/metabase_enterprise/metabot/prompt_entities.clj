(ns metabase-enterprise.metabot.prompt-entities
  "pgvector mirror and similarity search for curated search prompts.

  The appdb `search_prompt_entities` table is authoritative.
  Its Toucan hooks call [[upsert-prompt-entity!]] / [[delete-prompt-entity!]] to keep a companion
  pgvector table in sync; that table carries the embedding and serves [[search-prompt-entities]],
  which backs the `search_prompt_entities` Metabot tool.
  These are `defenterprise` impls; the OSS shims live in [[metabase.metabot.prompt-entities]].

  Hackathon-grade: the companion table is created lazily and never migrated, and embeddings come from
  the configured embedding service."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(def ^:dynamic *table-name*
  "Companion pgvector table name.
  Dynamic so tests can rebind it to an isolated table."
  "search_prompt_entities_index")

(defn- hnsw-index-name [] (str *table-name* "_embed_hnsw_idx"))

;; Weighted scorers, mirroring the regular search scoring shape (see metabase.search.scoring):
;; each factor contributes weight * score, and :total_score is their sum. Similarity (1 - cosine
;; distance) is the primary signal; canonical and verified are flat 0/1 indicator boosts.
(def ^:private similarity-weight 1.0)
(def ^:private canonical-weight 0.15)
(def ^:private verified-weight 0.1)
(def ^:private default-limit 10)

(defn- pgvector-available?
  "True when the pgvector store is configured (MB_PGVECTOR_DB_URL set)."
  []
  (some? semantic.db.datasource/db-url))

;; Local copy of the private helper in semantic-search.index.
(defn- format-embedding
  "Format a float-array embedding as a pgvector SQL literal, validating numerics."
  [embedding]
  (doseq [v embedding]
    (when-not (number? v)
      (throw (ex-info "Embedding contains non-numeric value" {:invalid-value v}))))
  (str "'[" (str/join ", " embedding) "]'::vector"))

(defn- sql-format-quoted [honey-sql]
  (sql/format honey-sql {:quoted true}))

(defn- configured-model [] (embedding/get-configured-model))

(defn ensure-table!
  "Idempotently create the companion pgvector table and its HNSW cosine index.
   Vector size tracks the configured embedding model's dimensions."
  [ds]
  (let [dims (:vector-dimensions (configured-model))]
    (jdbc/execute! ds (sql/format (sql.helpers/create-extension :vector :if-not-exists)))
    (jdbc/execute!
     ds
     (-> (sql.helpers/create-table (keyword *table-name*) :if-not-exists)
         (sql.helpers/with-columns
           [[:prompt_id :bigint [:primary-key]]
            [:search_prompt :text :not-null]
            [:usage_instructions :text :not-null]
            [:entities :jsonb :not-null]
            [:canonical :boolean :not-null]
            [:verified :boolean [:default false] :not-null]
            [:embedding [:raw (format "vector(%d)" dims)] :not-null]])
         sql-format-quoted))
    ;; Backfill the column on tables created before `verified` existed (hackathon table, no migrations).
    (jdbc/execute! ds [(str "ALTER TABLE " *table-name*
                            " ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false")])
    (jdbc/execute!
     ds
     (-> (sql.helpers/create-index
          [(keyword (hnsw-index-name)) :if-not-exists]
          [(keyword *table-name*) :using-hnsw [[:raw "embedding vector_cosine_ops"]]])
         sql-format-quoted))))

(defenterprise upsert-prompt-entity!
  "Embed `search-prompt` and upsert the companion pgvector row keyed on `id`.
  `entities` is the bare list of entity refs; `canonical?` comes from the appdb row's `type`.
  `usage-instructions` is the agent-facing guidance for the mapped entities; nil is coerced to \"\"
  since the companion column is NOT NULL."
  :feature :semantic-search
  [id search-prompt usage-instructions entities verified canonical?]
  (when (pgvector-available?)
    (let [ds        (semantic.db.datasource/ensure-initialized-data-source!)
          embedding (embedding/get-embedding (configured-model) search-prompt
                                             {:type :index :record-tokens? false})
          record    {:prompt_id          id
                     :search_prompt      search-prompt
                     :usage_instructions (or usage-instructions "")
                     :entities           [:cast (json/encode entities) :jsonb]
                     :canonical          (boolean canonical?)
                     :verified           (boolean verified)
                     :embedding          [:raw (format-embedding embedding)]}]
      (ensure-table! ds)
      (jdbc/execute!
       ds
       (-> (sql.helpers/insert-into (keyword *table-name*))
           (sql.helpers/values [record])
           (sql.helpers/on-conflict :prompt_id)
           (sql.helpers/do-update-set :search_prompt :usage_instructions :entities :canonical :verified :embedding)
           sql-format-quoted)))))

(defenterprise delete-prompt-entity!
  "Remove the companion pgvector row for appdb `id`."
  :feature :semantic-search
  [id]
  (when (pgvector-available?)
    (let [ds (semantic.db.datasource/ensure-initialized-data-source!)]
      (jdbc/execute!
       ds
       (-> (sql.helpers/delete-from (keyword *table-name*))
           (sql.helpers/where [:= :prompt_id id])
           sql-format-quoted)))))

(defn- decode-entities [v]
  (cond
    (instance? PGobject v) (json/decode (.getValue ^PGobject v) true)
    (string? v)            (json/decode v true)
    :else                  v))

(defn- scorer [nm score weight]
  (let [score (double score) weight (double weight)]
    {:name nm :score score :weight weight :contribution (* score weight)}))

(defn- score
  "Build a weighted-scorer breakdown for one row, shaped like regular search's scoring.
  Returns a `:scores` vector of `{:name :score :weight :contribution}` plus the weighted-sum `:total_score`."
  [{:keys [distance canonical verified]}]
  (let [scores [(scorer :similarity (- 1.0 (double distance)) similarity-weight)
                (scorer :canonical  (if canonical 1.0 0.0)     canonical-weight)
                (scorer :verified   (if verified 1.0 0.0)      verified-weight)]]
    {:scores      scores
     :total_score (reduce + (map :contribution scores))}))

(defenterprise search-prompt-entities
  "Find the nearest saved prompts to `user-search-prompt` by cosine distance, up to `limit`.
  Results are ranked by blended score (similarity + canonical + verified boosts), each shaped
  `{:saved_search_prompt :usage_instructions :entities :score}`.
  Returns [] when pgvector is unconfigured."
  :feature :semantic-search
  [user-search-prompt limit]
  (if-not (pgvector-available?)
    []
    (let [ds        (semantic.db.datasource/ensure-initialized-data-source!)
          limit     (or limit default-limit)
          embedding (embedding/get-embedding (configured-model) user-search-prompt
                                             {:type :query :record-tokens? false})
          lit       (format-embedding embedding)
          rows      (jdbc/execute!
                     ds
                     (-> (sql.helpers/select :search_prompt :usage_instructions :entities :canonical :verified
                                             [[:raw (str "embedding <=> " lit)] :distance])
                         (sql.helpers/from (keyword *table-name*))
                         (sql.helpers/order-by [[:raw (str "embedding <=> " lit)] :asc])
                         (sql.helpers/limit limit)
                         sql-format-quoted)
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (->> rows
           (map (fn [row]
                  {:saved_search_prompt (:search_prompt row)
                   :usage_instructions  (:usage_instructions row)
                   :entities            (decode-entities (:entities row))
                   :score               (score row)}))
           (sort-by (comp :total_score :score) >)
           vec))))
