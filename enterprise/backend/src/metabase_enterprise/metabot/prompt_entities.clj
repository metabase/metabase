(ns metabase-enterprise.metabot.prompt-entities
  "pgvector mirror + similarity search for curated search prompts.

   The appdb `search_prompt_entities` table (see [[metabase.metabot.models.search-prompt-entity]])
   is authoritative; its Toucan hooks call [[upsert-prompt-entity!]] / [[delete-prompt-entity!]] here
   to keep a companion table in the enterprise pgvector store in sync. That companion table carries
   the embedding vector and serves [[search-prompt-entities]], which backs the `search_prompt_entities`
   Metabot tool. These are `defenterprise` impls; the OSS shims live in [[metabase.metabot.prompt-entities]].

   Hackathon-grade: the companion table is created lazily and never migrated; the embedding is fetched
   from the configured embedding service; scoring blends cosine similarity with a flat canonical
   boost. Reuses the semantic-search datasource and embedding API."
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

(def ^:private table-name "search_prompt_entities_index")
(def ^:private hnsw-index-name "search_prompt_entities_index_embed_hnsw_idx")

;; Cosine distance is in [0, 2]; similarity = 1 - distance. Canonical prompts point at a single
;; entity that directly answers the request, so they get a flat boost over source-entity sets.
(def ^:private canonical-boost 0.15)
(def ^:private default-limit 10)

(defn- pgvector-available?
  "True when the pgvector store is configured (MB_PGVECTOR_DB_URL set)."
  []
  (some? semantic.db.datasource/db-url))

(defn- format-embedding
  "Format a float-array embedding as a pgvector SQL literal, validating numerics.
   (Local copy of the private helper in semantic-search.index.)"
  [embedding]
  (doseq [v embedding]
    (when-not (number? v)
      (throw (ex-info "Embedding contains non-numeric value" {:invalid-value v}))))
  (str "'[" (str/join ", " embedding) "]'::vector"))

(defn- sql-format-quoted [honey-sql]
  (sql/format honey-sql {:quoted true}))

(defn- configured-model [] (embedding/get-configured-model))

(defn- canonical-entities? [entities]
  (= "canonical" (:type entities)))

(defn ensure-table!
  "Idempotently create the companion pgvector table and its HNSW cosine index.
   Vector size tracks the configured embedding model's dimensions."
  [ds]
  (let [dims (:vector-dimensions (configured-model))]
    (jdbc/execute! ds (sql/format (sql.helpers/create-extension :vector :if-not-exists)))
    (jdbc/execute!
     ds
     (-> (sql.helpers/create-table (keyword table-name) :if-not-exists)
         (sql.helpers/with-columns
           [[:prompt_id :bigint [:primary-key]]
            [:search_prompt :text :not-null]
            [:entities :jsonb :not-null]
            [:canonical :boolean :not-null]
            [:embedding [:raw (format "vector(%d)" dims)] :not-null]])
         sql-format-quoted))
    (jdbc/execute!
     ds
     (-> (sql.helpers/create-index
          [(keyword hnsw-index-name) :if-not-exists]
          [(keyword table-name) :using-hnsw [[:raw "embedding vector_cosine_ops"]]])
         sql-format-quoted))))

(defenterprise upsert-prompt-entity!
  "Embed `search-prompt` and upsert the companion pgvector row keyed on `id`."
  :feature :semantic-search
  [id search-prompt entities]
  (when (pgvector-available?)
    (let [ds        (semantic.db.datasource/ensure-initialized-data-source!)
          embedding (embedding/get-embedding (configured-model) search-prompt
                                             {:type :index :record-tokens? false})
          record    {:prompt_id     id
                     :search_prompt search-prompt
                     :entities      [:cast (json/encode entities) :jsonb]
                     :canonical     (canonical-entities? entities)
                     :embedding     [:raw (format-embedding embedding)]}]
      (ensure-table! ds)
      (jdbc/execute!
       ds
       (-> (sql.helpers/insert-into (keyword table-name))
           (sql.helpers/values [record])
           (sql.helpers/on-conflict :prompt_id)
           (sql.helpers/do-update-set :search_prompt :entities :canonical :embedding)
           sql-format-quoted)))))

(defenterprise delete-prompt-entity!
  "Remove the companion pgvector row for appdb `id`."
  :feature :semantic-search
  [id]
  (when (pgvector-available?)
    (let [ds (semantic.db.datasource/ensure-initialized-data-source!)]
      (jdbc/execute!
       ds
       (-> (sql.helpers/delete-from (keyword table-name))
           (sql.helpers/where [:= :prompt_id id])
           sql-format-quoted)))))

(defn- decode-entities [v]
  (cond
    (instance? PGobject v) (json/decode (.getValue ^PGobject v) true)
    (string? v)            (json/decode v true)
    :else                  v))

;; TODO (Chris 2026-06-02) -- the appdb table also has a `verified` flag (from the CRUD branch). Once
;; the mirror carries it, fold it in here as an additional boost, like search does for verified content.
(defn- score [{:keys [distance canonical]}]
  (let [similarity (- 1.0 (double distance))
        boost      (if canonical canonical-boost 0.0)]
    {:cosine_distance (double distance)
     :similarity      similarity
     :canonical       (boolean canonical)
     :canonical_boost boost
     :total           (+ similarity boost)}))

(defenterprise search-prompt-entities
  "Embed `user-search-prompt`, find the nearest saved prompts by cosine distance, and return up to
   `limit` results ranked by blended score (similarity + canonical boost). Each result is
   `{:saved_search_prompt :entities :score}`. Returns [] when pgvector is unconfigured."
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
                     (-> (sql.helpers/select :search_prompt :entities :canonical
                                             [[:raw (str "embedding <=> " lit)] :distance])
                         (sql.helpers/from (keyword table-name))
                         (sql.helpers/order-by [[:raw (str "embedding <=> " lit)] :asc])
                         (sql.helpers/limit limit)
                         sql-format-quoted)
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
      (->> rows
           (map (fn [row]
                  {:saved_search_prompt (:search_prompt row)
                   :entities            (decode-entities (:entities row))
                   :score               (score row)}))
           (sort-by (comp :total :score) >)
           vec))))
