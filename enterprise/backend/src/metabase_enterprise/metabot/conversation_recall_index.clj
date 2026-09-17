(ns metabase-enterprise.metabot.conversation-recall-index
  "Derived pgvector/full-text index for private Metabot conversation excerpts."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.core :as semantic]
   [metabase-enterprise.semantic-search.db.datasource :as datasource]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.metabot.conversation-recall :as recall]
   [metabase.metabot.db :as metabot.db]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(defn- table-name []
  (format (:index-table-qualifier (semantic/get-index-metadata)) "conversation_chunk"))

(defn- meta-table []
  (format (:index-table-qualifier (semantic/get-index-metadata)) "conversation_recall_metadata"))

(def ^:private row-options {:builder-fn jdbc.rs/as-unqualified-lower-maps})
(def ^:private schema-version 1)
(def ^:private index-lock 20031)

(defn available?
  "Whether conversation indexing has a configured embedder and a store with pgvector already enabled."
  []
  (and (embedding/embedding-supported? (embedding/get-configured-model))
       (datasource/pgvector-configured?)
       (boolean
        (:installed (jdbc/execute-one! (datasource/ensure-initialized-data-source!)
                                       ["SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"]
                                       row-options)))))

(defn- configured-model []
  (embedding/resolve-model (embedding/get-configured-model)))

(defn- model-key [model]
  (pr-str [schema-version (:provider model) (:model-name model)
           (:vector-dimensions model) (:embedding-space-id model)]))

(defn- lock-index! [tx]
  (jdbc/execute! tx ["SELECT pg_advisory_xact_lock(?)" index-lock]))

(defn- ensure-tables! [tx model]
  (semantic/ensure-schema-exists! (semantic/get-index-metadata) tx)
  (jdbc/execute! tx [(str "CREATE TABLE IF NOT EXISTS " (meta-table)
                          " (id integer PRIMARY KEY CHECK (id = 1), model_key text NOT NULL, cursor text)")])
  (let [existing (jdbc/execute-one! tx [(str "SELECT model_key FROM " (meta-table) " WHERE id = 1")] row-options)]
    (when (not= (:model_key existing) (model-key model))
      (jdbc/execute! tx [(str "DROP TABLE IF EXISTS " (table-name))])
      (jdbc/execute! tx [(str "INSERT INTO " (meta-table) " (id, model_key) VALUES (1, ?) "
                              "ON CONFLICT (id) DO UPDATE SET model_key = EXCLUDED.model_key, cursor = NULL")
                         (model-key model)])))
  (jdbc/execute! tx [(str "CREATE TABLE IF NOT EXISTS " (table-name)
                          " (chunk_id text PRIMARY KEY, user_id bigint NOT NULL, conversation_id text NOT NULL,"
                          " message_id bigint NOT NULL, content_hash text NOT NULL, created_at timestamptz NOT NULL,"
                          " body text NOT NULL, embedding vector(" (int (:vector-dimensions model)) ") NOT NULL,"
                          " search_text tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED)")])
  (jdbc/execute! tx [(str "CREATE INDEX IF NOT EXISTS conversation_chunk_owner ON " (table-name)
                          " (user_id, conversation_id)")])
  (jdbc/execute! tx [(str "CREATE INDEX IF NOT EXISTS conversation_chunk_words ON " (table-name)
                          " USING gin(search_text)")]))

(defn- vector-text [values]
  (str "[" (str/join "," values) "]"))

(defn- documents [conversation-id]
  (mapv #(assoc % :chunk-id (str conversation-id ":" (:message-id %) ":" (:chunk-index %)))
        (recall/chunks conversation-id)))

(defn- embed-documents [model docs]
  (let [vectors (atom {})]
    (when (seq docs)
      (embedding/process-embeddings-streaming
       model (map :text docs)
       (fn [batch] (swap! vectors merge batch) nil)
       :type :index :record-tokens? true))
    @vectors))

(defn- upsert-document! [tx user-id conversation-id doc vector]
  (jdbc/execute! tx
                 [(str "INSERT INTO " (table-name)
                       " (chunk_id, user_id, conversation_id, message_id, content_hash, created_at, body, embedding)"
                       " VALUES (?, ?, ?, ?, ?, ?, ?, ?::vector) ON CONFLICT (chunk_id) DO UPDATE SET"
                       " user_id = EXCLUDED.user_id, content_hash = EXCLUDED.content_hash,"
                       " created_at = EXCLUDED.created_at, body = EXCLUDED.body, embedding = EXCLUDED.embedding")
                  (:chunk-id doc) user-id conversation-id (:message-id doc) (:content-hash doc)
                  (:created-at doc) (:text doc) (vector-text vector)]))

(defn reconcile-conversation!
  "Reconcile one conversation. Unchanged chunks retain their embeddings; obsolete chunks are removed."
  [conversation-id]
  (jdbc/with-transaction [tx (datasource/ensure-initialized-data-source!)]
    (lock-index! tx)
    (let [model (configured-model)]
      (ensure-tables! tx model)
      (let [conversation (metabot.db/conversation conversation-id)
            docs         (when (:user_id conversation) (documents conversation-id))
            existing     (into {} (map (juxt :chunk_id :content_hash))
                               (jdbc/execute! tx [(str "SELECT chunk_id, content_hash FROM " (table-name)
                                                       " WHERE conversation_id = ?") conversation-id] row-options))
            changed      (filterv #(not= (:content-hash %) (existing (:chunk-id %))) docs)
            wanted       (set (map :chunk-id docs))
            obsolete     (remove wanted (keys existing))
            vectors      (embed-documents model changed)]
        (doseq [doc changed]
          (let [vector (get vectors (:text doc))]
            (when-not vector
              (throw (ex-info "Embedding provider did not return an excerpt embedding" {:conversation-id conversation-id})))
            (upsert-document! tx (:user_id conversation) conversation-id doc vector)))
        (doseq [id obsolete]
          (jdbc/execute! tx [(str "DELETE FROM " (table-name) " WHERE chunk_id = ?") id]))
        {:indexed (count changed) :deleted (count obsolete) :unchanged (- (count docs) (count changed))}))))

(defn- index-compatible? [ds model]
  (= (model-key model)
     (:model_key (jdbc/execute-one! ds [(str "SELECT model_key FROM " (meta-table) " WHERE id = 1")] row-options))))

(defn- search-filter [user-id excluded-id conversation-id]
  [(str "user_id = ?" (when excluded-id " AND conversation_id <> ?")
        (when conversation-id " AND conversation_id = ?"))
   (cond-> [user-id] excluded-id (conj excluded-id) conversation-id (conj conversation-id))])

(defn- candidates [ds user-id excluded-id conversation-id query vector]
  (let [[where params] (search-filter user-id excluded-id conversation-id)
        columns "chunk_id, conversation_id, message_id, content_hash, created_at"
        lexical (jdbc/execute! ds
                               (into [(str "SELECT " columns " FROM " (table-name) " WHERE " where
                                           " AND search_text @@ websearch_to_tsquery('simple', ?)"
                                           " ORDER BY ts_rank_cd(search_text, websearch_to_tsquery('simple', ?)) DESC,"
                                           " created_at DESC LIMIT 30")]
                                     (concat params [query query])) row-options)
        semantic (when vector
                   (jdbc/execute! ds
                                  (into [(str "SELECT " columns " FROM " (table-name) " WHERE " where
                                              " ORDER BY embedding <=> ?::vector, created_at DESC LIMIT 30")]
                                        (concat params [(vector-text vector)])) row-options))]
    (->> [lexical semantic]
         (mapcat #(map-indexed (fn [i row] (assoc row :score (/ 1.0 (+ 60 i)))) %))
         (reduce (fn [acc row]
                   (update acc (:chunk_id row)
                           (fn [previous] (update row :score + (:score previous 0))))) {})
         vals
         (sort-by (juxt :score :created_at) #(compare %2 %1))
         vec)))

(defenterprise search
  "Hybrid search restricted to an owner. Keyword retrieval remains available when query embedding fails."
  :feature :none
  [user-id excluded-id query conversation-id]
  (try
    (if-not (and user-id (datasource/pgvector-configured?))
      {:status :unavailable :results []}
      (let [ds (datasource/ensure-initialized-data-source!)
            model (configured-model)]
        (if-not (index-compatible? ds model)
          {:status :unavailable :results []}
          (let [vector (try
                         (embedding/get-embedding model (embedding/prefix-search-query model query)
                                                  :type :query :record-tokens? true)
                         (catch Exception e
                           (log/warn "Conversation recall is using keyword search:" (ex-message e))
                           nil))]
            {:status (if vector :ok :keyword-only)
             :results (candidates ds user-id excluded-id conversation-id query vector)}))))
    (catch Exception e
      (log/warn "Conversation recall index unavailable:" (ex-message e))
      {:status :unavailable :results []})))

(defonce ^:private pending (atom #{}))
(defonce ^:private running? (atom false))

(defn- next-pending! []
  (locking pending
    (if-let [id (first @pending)]
      (do (swap! pending disj id) id)
      (do (reset! running? false) nil))))

(defn- drain! []
  (while (when-let [id (next-pending!)]
           (try
             (when (available?) (reconcile-conversation! id))
             (catch Exception e
               ;; A later sweep retries it; never spin on a failing embedding provider.
               (log/warn "Conversation index update failed:" id (ex-message e))))
           true)))

(defenterprise request-sync!
  "Enqueue background reconciliation without blocking the caller. No-op in OSS."
  :feature :none
  [conversation-id]
  (when conversation-id
    (locking pending
      (swap! pending conj conversation-id)
      (when (compare-and-set! running? false true)
        (future (drain!)))))
  nil)

(defn backfill!
  "Index a page of historical conversations. Accepts :user-id, :after-id and :limit (default 25).
  Returns the next cursor and counts; omitting user/cursor uses and advances the persisted sweep cursor."
  ([] (backfill! {}))
  ([{:keys [user-id after-id limit] :or {limit 25} :as options}]
   (if-not (available?)
     {:status :unavailable}
     (let [ds (datasource/ensure-initialized-data-source!)
           sweep? (not (or user-id (contains? options :after-id)))
           cursor (jdbc/with-transaction [tx ds]
                    (lock-index! tx)
                    (ensure-tables! tx (configured-model))
                    (if sweep?
                      (:cursor (jdbc/execute-one! tx [(str "SELECT cursor FROM " (meta-table) " WHERE id = 1")] row-options))
                      after-id))
           rows (metabot.db/recall-backfill-page {:user-id user-id :after-id cursor :limit limit})
           counts (reduce (fn [counts {:keys [id]}]
                            (try
                              (merge-with + (update counts :processed inc) (reconcile-conversation! id))
                              (catch Exception e
                                (log/warn "Conversation backfill failed:" id (ex-message e))
                                (update counts :failed inc))))
                          {:processed 0 :failed 0 :indexed 0 :deleted 0 :unchanged 0} rows)
           next-cursor (when (= limit (count rows)) (:id (last rows)))
           result (assoc counts :status :ok :cursor next-cursor :complete? (nil? next-cursor))]
       (when sweep?
         (jdbc/execute! ds [(str "UPDATE " (meta-table) " SET cursor = ? WHERE id = 1") next-cursor]))
       (log/info "Conversation recall backfill batch" result)
       result))))
