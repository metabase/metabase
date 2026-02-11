(ns metabase-enterprise.semantic-search.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :refer [env]]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.search.config :as search.config]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (clojure.lang IDeref)
   (com.mchange.v2.c3p0 PooledDataSource)
   (java.io Closeable)
   (java.time Instant)))

(set! *warn-on-reflection* true)

;; Purpose of this fixure is to block running tests if db-url is not set. That's true for enterprise app-db tests in CI.
(defn once-fixture
  [f]
  (when semantic.db.datasource/db-url
    (f)))

(def default-test-db "my_test_db")

(defn- alt-db-name-url
  [url alt-name]
  (when (string? url)
    (u/prog1 (str/replace-first url
                                #"(^\S+//\S+/)([A-Za-z0-9_-]+)($|\?.*)"
                                (str "$1" alt-name "$3"))
      (when (nil? <>) (throw (Exception. "Empty pgvector url."))))))

(defn do-with-temp-datasource!
  "Impl [[with-temp-datasource]]."
  [db-name thunk]
  (with-redefs [semantic.db.datasource/db-url (alt-db-name-url (:mb-pgvector-db-url env) db-name)
                semantic.db.datasource/data-source (atom nil)]
    (try
      ;; ensure datasource was initialized so we can close it in finally.
      (semantic.db.datasource/ensure-initialized-data-source!)
      (thunk)
      (finally
        (.close ^PooledDataSource @semantic.db.datasource/data-source)))))

(defmacro with-temp-datasource!
  "Redefine datasource for testing, not thread-safe"
  [db-name & body]
  `(do-with-temp-datasource! ~db-name (fn [] ~@body)))

(defmulti do-with-setup-test-db!
  "Setup pgvector database for tests."
  {:arglists '([mode thunk])}
  (fn [mode _thunk] mode))

(defmethod do-with-setup-test-db! :blank
  [_mode thunk]
  (thunk))

(declare mock-embedding-model
         mock-index-metadata
         mock-table-suffix)

(defmethod do-with-setup-test-db! :mock-initialized
  [_mode thunk]
  (with-redefs [semantic.embedding/get-configured-model        (fn [] mock-embedding-model)
                semantic.index-metadata/default-index-metadata mock-index-metadata
                semantic.index/model-table-suffix              mock-table-suffix]
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.env/get-index-metadata)
          embedding-model (semantic.env/get-configured-embedding-model)]
      (semantic.pgvector-api/init-semantic-search! pgvector index-metadata embedding-model)
      (thunk))))

;; TODO: declare with macro (the do- less version) throws weird errors -- investigate!
(declare do-with-indexable-documents!)

(defmethod do-with-setup-test-db! :mock-gated
  [mode thunk]
  ((get-method do-with-setup-test-db! :mock-initialized)
   mode
   (fn []
     (do-with-indexable-documents!
      (fn []
        (let [pgvector (semantic.env/get-pgvector-datasource!)
              index-metadata (semantic.env/get-index-metadata)]
          (semantic.pgvector-api/gate-updates! pgvector
                                               index-metadata
                                               (search.ingestion/searchable-documents))
          (thunk)))))))

(declare index-all!)

(defmethod do-with-setup-test-db! :mock-indexed
  [mode thunk]
  ((get-method do-with-setup-test-db! :mock-gated)
   mode
   (fn []
     (index-all!)
     (thunk))))

;; Reminder: this can be adjusted so (1) each database is unique and (2) redefs are thread local (latter is not simple
;; but possible I believe), so we can take advantage of parallel tests.
(defn do-with-test-db!
  "Impl [[with-test-db]]"
  [{:keys [dbname mode cleanup]
    :or {dbname default-test-db
         mode :blank
         cleanup :before}
    :as _opts}
   thunk]
  (with-temp-datasource! "postgres"
    (try
      (when (#{:before :both} cleanup)
        (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                       [(str "DROP DATABASE IF EXISTS " dbname " (FORCE)")]))
      (log/debugf "Creating database %s" dbname)
      (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                     [(str "CREATE DATABASE " dbname)])
      (log/debugf "Created test pgvector database %s" dbname)
      (catch java.sql.SQLException e
        (log/debugf "Creation of test pgvector database %s failed" dbname)
        (throw e))))

  (with-temp-datasource! dbname
    (do-with-setup-test-db! mode thunk))

  (when (#{:after :both} cleanup)
    (with-temp-datasource! "postgres"
      (try
        (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                       [(str "DROP DATABASE IF EXISTS " dbname " (FORCE)")])
        (catch java.sql.SQLException e
          (log/debugf "Test pgvector database teardown %s failed" dbname)
          (throw e))))))

;; TODO: When we are parallelizing tests, we'd have to make
;;       - `with-test-db!` use thread-safe version of with-redefs or similar,
;;       - instead of `default-test-db` we could make unique database per test by means of eg. some counter.
(defmacro with-test-db!
  "Drop, create database dbname on pgvector and redefine datasource accordingly. Not thread safe."
  [opts & body]
  `(do-with-test-db! ~opts (fn [] ~@body)))

(defmacro with-test-db-defaults!
  "Tiny wrapper to avoid at this point redundant {} arg of [[with-test-db!]]."
  [& body]
  `(with-test-db! {} ~@body))

(defmacro with-weights
  "Execute `body` overriding search weights with `weight-map`."
  [weight-map & body]
  `(mt/with-dynamic-fn-redefs [search.config/weights (constantly ~weight-map)]
     ~@body))

(defmacro with-only-semantic-weights
  "Execute `body` with only the semantic search hybrid scorer weights active."
  [& body]
  `(with-weights {:rrf 1}
     ~@body))

(def ^:private mock-documents-for-embeddings
  "Mock documents and queries for testing, associated with fake embedding vectors in [[mock-embeddings]]."
  [{:model "card" :name "Dog Training Guide" :query "puppy"}
   {:model "card" :name "Bird Watching Tips" :query "avian"}
   {:model "card" :name "Cat Behavior Study" :query "feline"}
   {:model "card" :name "Horse Racing Analysis" :query "equine"}
   {:model "card" :name "Fish Tank Setup" :query "aquatic"}
   {:model "card" :name "Bigfoot Sightings" :query "spooky video evidence"}
   {:model "dashboard" :name "Elephant Migration" :query "pachyderm"}
   {:model "dashboard" :name "Lion Pride Dynamics" :query "predator"}
   {:model "dashboard" :name "Penguin Colony Study" :query "Antarctic wildlife"}
   {:model "dashboard" :name "Whale Communication" :query "marine mammal"}
   {:model "dashboard" :name "Tiger Conservation" :query "endangered species"}
   {:model "dashboard" :name "Loch Ness Stuff" :query "prehistoric monsters"}
   ;; Tables include display_name in their search-terms (see table.clj:387-389), which gets
   ;; included in embeddable_text as "display_name: Species Table". We must include it here
   ;; so the mock embeddings match what gets indexed.
   {:model "table" :name "Species Table" :display_name "Species Table" :query "taxonomy"}
   {:model "table" :name "Monsters Table" :display_name "Monsters Table" :query "monster facts"}])

(def ^:private base-embedding-vectors
  "Fake 4-dimensional embedding vectors for each document"
  [[0.12 -0.34  0.56 -0.78]
   [0.23  0.45 -0.67  0.89]
   [0.11 -0.22  0.33 -0.44]
   [0.55  0.66 -0.77  0.88]
   [0.10  0.20 -0.30  0.40]
   [0.19  0.30 -0.41  0.52]
   [0.15 -0.25  0.35 -0.45]
   [0.31  0.42 -0.53  0.64]
   [0.75 -0.86  0.97 -0.18]
   [0.29  0.38 -0.47  0.56]
   [0.65 -0.74  0.83 -0.92]
   [0.77 -0.88  0.99 -0.19]
   [0.21  0.32 -0.43  0.54]
   [0.79 -0.89  0.91 -0.20]])

(defn- slightly-different-vector
  "Make a slightly different vector for the query so it's similar but not identical to the document."
  [v]
  (mapv #(+ % 0.01) v))

(def mock-embeddings
  "Static mapping from strings to (made-up) 4-dimensional embedding vectors for testing."
  (into {}
        (mapcat (fn [doc base-vec]
                  (let [embeddable-text (#'search.ingestion/embeddable-text doc)
                        query (:query doc)]
                    [[embeddable-text base-vec]
                     [query (slightly-different-vector base-vec)]]))
                mock-documents-for-embeddings
                base-embedding-vectors)))

(def ^:dynamic *extra-mock-embeddings*
  "Dynamic var for test-specific mock embeddings. Merged with [[mock-embeddings]] in [[get-mock-embedding]]."
  nil)

(defn- parse-entity-name
  "Extract the entity name from embeddable text format.
   E.g., '[dashboard]\\nname: My Dashboard\\n...' -> 'My Dashboard'"
  [text]
  (second (re-find #"(?m)^name:\s*(.+)$" text)))

(defn get-mock-embedding
  "Lookup the embedding for `text` in [[*extra-mock-embeddings*]] first, then [[mock-embeddings]].
   Lookups try both the raw text and the parsed entity name from embeddable text format."
  [text]
  (let [entity-name (parse-entity-name text)]
    (or (get *extra-mock-embeddings* text)
        (get *extra-mock-embeddings* entity-name)
        (get mock-embeddings text)
        (get mock-embeddings entity-name)
        [0.01 0.02 0.03 0.04])))

(defn get-mock-embeddings-batch
  "Lookup embeddings for multiple texts in [[mock-embeddings]]."
  [texts]
  (mapv get-mock-embedding texts))

(defmacro with-mock-embeddings
  "Bind extra mock embeddings for the duration of `body`. The embeddings map should be
   a map from text strings to 4-dimensional vectors, e.g.:

   (with-mock-embeddings
     {\"belligerent\" [0.9 0.1 0.0 0.0]
      \"combative\"   [0.91 0.11 0.01 0.01]}  ; similar vector = semantic match
     ...)"
  [embeddings-map & body]
  `(binding [*extra-mock-embeddings* ~embeddings-map]
     ~@body))

;;;; mock provider

(def mock-embedding-model
  {:provider          "mock"
   :model-name        "model"
   :vector-dimensions 4})

(def mock-index-metadata
  "An index metadata to qualify and isolate mock indexes"
  {:version               "0"
   :metadata-table-name   "mock_index_metadata"
   :control-table-name    "mock_index_control"
   :gate-table-name       "mock_index_gate"
   :index-table-qualifier "_%s"})

(defn unique-index-metadata
  []
  (let [uniq-id (System/nanoTime)
        fmt     (str "mock_%s_" uniq-id)]
    {:version               "0"
     :metadata-table-name   (format fmt "metadata")
     :control-table-name    (format fmt "control")
     :gate-table-name       (format fmt "gate")
     :index-table-qualifier fmt}))

(defn mock-table-suffix [] 123)

(def mock-index
  "A mock index for testing low level indexing functions.
  Coincides with what the index-metadata system would create for the mock-embedding-model."
  (with-redefs [semantic.index/model-table-suffix mock-table-suffix]
    (-> (semantic.index/default-index mock-embedding-model)
        (semantic.index-metadata/qualify-index mock-index-metadata))))

;; NOTE: opts are currently unused in following mock implementations
(defmethod semantic.embedding/get-embedding        "mock" [_ text & {:as _opts}] (get-mock-embedding text))
(defmethod semantic.embedding/get-embeddings-batch "mock" [_ texts & {:as _opts}] (get-mock-embeddings-batch texts))
(defmethod semantic.embedding/pull-model           "mock" [_])

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn query-index [search-context]
  (:results (semantic.index/query-index (semantic.env/get-pgvector-datasource!) mock-index search-context)))

;; TODO: this should go!!!
(defn upsert-index! [documents & {:keys [index] :or {index mock-index} :as opts}]
  (semantic.index/upsert-index! (semantic.env/get-pgvector-datasource!) index documents opts))

(defn delete-from-index! [model ids]
  (semantic.index/delete-from-index! (semantic.env/get-pgvector-datasource!) mock-index model ids))

(defn dog-training-native-query []
  (mt/native-query {:query "SELECT AVG(tricks) FROM dogs WHERE age > 7 GROUP BY breed"}))

(defn mock-documents []
  (let [native-query-json (-> (dog-training-native-query) json/encode)]
    [{:model "card"
      :id 123
      :name "Dog Training Guide"
      :searchable_text "Dog Training Guide"
      :embeddable_text "Dog Training Guide"
      :created_at #t "2025-01-01T12:00:00Z"
      :creator_id 1
      :archived false
      :legacy_input {:id 123
                     :model "card"
                     :dataset_query native-query-json}
      :native_query native-query-json
      :metadata {:title "Dog Training Guide"
                 :description "How to teach an old dog new tricks"
                 :native-query native-query-json}}
     {:model "dashboard"
      :id 456
      :name "Elephant Migration"
      :searchable_text "Elephant Migration"
      :embeddable_text "Elephant Migration"
      :created_at #t "2025-02-01T12:00:00Z"
      :creator_id 2
      :archived true
      :legacy_input {:model "dashboard" :id 456}
      :metadata {:title "Elephant Migration" :description "How do elephants deal with schema upgrades?"}}]))

(defn filter-for-mock-embeddings
  "Filter results to only include items whose names are keys in mock-embeddings map."
  [results]
  (let [mock-document-names (set (map :name mock-documents-for-embeddings))]
    (filter #(contains? mock-document-names (:name %)) results)))

(defn closeable ^Closeable [o close-fn]
  (reify
    IDeref
    (deref [_] o)
    Closeable
    (close [_] (close-fn o))))

(defn open-temp-index! ^Closeable [& {:keys [index] :or {index mock-index}}]
  (closeable
   (do (semantic.index/create-index-table-if-not-exists! (semantic.env/get-pgvector-datasource!) index {:force-reset? true})
       index)
   (fn cleanup-temp-index-table! [{:keys [table-name] :as index}]
     (try
       (semantic.index/drop-index-table! (semantic.env/get-pgvector-datasource!) index)
       (catch Exception e
         (log/error e "Warning: failed to clean up test table" table-name))))))

(defn do-with-indexable-documents!
  "Wrap the thunk into with-temp, creating entities used throughout semantic search test.

  N.B. *disable-updates* is bound to avoid processing of those entities by logic in [[search.ingestion]] ns.
  The processing is triggered by means :hook/search-index which :model/Card (and others) derive.

  As of 2025-09-10, processing triggered by insertion, combined with manual gating of documents that callers
  of this fn do, would result in duplicate processing and deletion of those entities from index
  due to [[search.ingestion/bulk-ingest!]].

  For details see the https://metaboat.slack.com/archives/C07SJT1P0ET/p1757452434713309?thread_ts=1757410361.879029&cid=C07SJT1P0ET"
  [thunk]
  ;; NB: *disable-updates*
  (binding [search.ingestion/*disable-updates* true]
    (mt/dataset
      test-data
      (mt/with-temp [:model/Collection
                     {col1 :id}
                     {:name "Wildlife Collection" :archived false}

                     :model/Collection
                     {col2 :id}
                     {:name "Archived Animals" :archived true}

                     :model/Collection
                     {col3 :id}
                     {:name "Cryptozoology", :archived false}

                     :model/Card
                     {card1 :id}
                     {:name "Dog Training Guide" :collection_id col1 :creator_id (mt/user->id :crowberto)
                      :archived false :query_type "native" :dataset_query (dog-training-native-query)}

                     :model/Card
                     _
                     {:name "Bird Watching Tips" :collection_id col1 :creator_id (mt/user->id :rasta) :archived false}

                     :model/Card
                     _
                     {:name "Cat Behavior Study" :collection_id col2 :creator_id (mt/user->id :crowberto) :archived true}

                     :model/Card
                     _
                     {:name "Horse Racing Analysis" :collection_id col1 :creator_id (mt/user->id :rasta) :archived false}

                     :model/Card
                     _
                     {:name "Fish Tank Setup" :collection_id col2 :creator_id (mt/user->id :crowberto) :archived true}

                     :model/Card
                     _
                     {:name "Bigfoot Sightings" :collection_id col3 :creator_id (mt/user->id :crowberto) :archived false}

                     :model/ModerationReview
                     _
                     {:moderated_item_type "card"
                      :moderated_item_id card1
                      :moderator_id (mt/user->id :crowberto)
                      :status "verified"
                      :most_recent true}

                     :model/Dashboard
                     _
                     {:name "Elephant Migration" :collection_id col1 :creator_id (mt/user->id :rasta) :archived false}

                     :model/Dashboard
                     _
                     {:name "Lion Pride Dynamics" :collection_id col1 :creator_id (mt/user->id :crowberto) :archived false}

                     :model/Dashboard
                     _
                     {:name "Penguin Colony Study" :collection_id col2 :creator_id (mt/user->id :rasta) :archived true}

                     :model/Dashboard
                     _
                     {:name "Whale Communication" :collection_id col1 :creator_id (mt/user->id :crowberto) :archived false}

                     :model/Dashboard
                     _
                     {:name "Tiger Conservation" :collection_id col2 :creator_id (mt/user->id :rasta) :archived true}

                     :model/Dashboard
                     _
                     {:name "Loch Ness Stuff" :collection_id col3 :creator_id (mt/user->id :crowberto), :archived false}

                     :model/Database
                     {db-id :id}
                     {:name "Animal Database"}

                     :model/Table
                     _
                     {:name "Species Table", :db_id db-id}

                     :model/Table
                     _
                     {:name "Monsters Table", :db_id db-id, :active true}]
        (thunk)))))

(defmacro with-indexable-documents!
  "Wrapper for [[do-with-indexable-documents!]]."
  [& body]
  `(do-with-indexable-documents! (fn [] ~@body)))

(defn index-all!
  "Run indexer synchronously until we've exhausted polling all documents"
  []
  (let [metadata-row   {:indexer_last_poll Instant/EPOCH
                        :indexer_last_seen Instant/EPOCH}
        indexing-state (semantic.indexer/init-indexing-state metadata-row)
        pgvector (semantic.env/get-pgvector-datasource!)
        step (fn [] (semantic.indexer/indexing-step pgvector mock-index-metadata mock-index indexing-state))]
    (while (do (step) (pos? (:last-novel-count @indexing-state))))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn table-exists-in-db?
  "Check if a table actually exists in the database"
  [table-name]
  (when table-name
    (try
      (semantic.util/table-exists? (semantic.env/get-pgvector-datasource!) (name table-name))
      (catch Exception _ false))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn table-has-index?
  [table-name index-name]
  (when table-name
    (try
      (let [result (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                                  ["SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?)"
                                   (name table-name)
                                   (name index-name)])]
        (-> result first vals first))
      (catch Exception _ false))))

(defn get-metadata-rows [pgvector index-metadata]
  (jdbc/execute! pgvector
                 (-> {:select [:*]
                      :from   [(keyword (:metadata-table-name index-metadata))]}
                     (sql/format :quoted true))
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn get-control-rows [pgvector index-metadata]
  (jdbc/execute! pgvector
                 (-> {:select [:*]
                      :from   [(keyword (:control-table-name index-metadata))]}
                     (sql/format :quoted true))
                 {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn cleanup-index-metadata!
  "A-la-carte drop everything related to the index-metdata root (including index tables themselves)"
  [pgvector index-metadata]
  (doseq [{index-id :id, :keys [table_name]}
          (when (table-exists-in-db? (:metadata-table-name index-metadata))
            (get-metadata-rows pgvector index-metadata))]
    (semantic.index/drop-index-table! pgvector {:table-name table_name})
    (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata index-id))
  (semantic.index-metadata/drop-tables-if-exists! pgvector index-metadata)
  (semantic.db.migration/drop-migration-table! pgvector))

(defn get-table-names [pgvector]
  (->> ["select table_name from information_schema.tables"]
       (jdbc/execute! pgvector)
       (mapv :tables/table_name)))

(defn open-metadata!
  "Create metadata tables and return a closeable that will clean them up when closed."
  ^Closeable [pgvector index-metadata]
  (closeable
   (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
   (fn [_] (cleanup-index-metadata! pgvector index-metadata))))

(defn open-index!
  "Create an index table and return a closeable that will drop it when closed."
  ^Closeable [pgvector index]
  (closeable
   (semantic.index/create-index-table-if-not-exists! pgvector index)
   (fn [_] (semantic.index/drop-index-table! pgvector index))))

(defn- decode-column
  [row column]
  (update row column #'semantic.index/decode-pgobject))

(defn- unwrap-column
  [row column]
  (update row column #'semantic.index/unwrap-pgobject))

(defn- decode-embedding
  "Decode `row`'s `:embedding` column."
  [row]
  (decode-column row :embedding))

(defn- unwrap-tsvectors
  "Decode `row`'s `:text_search_vector` and `:text_search_with_native_query_vector` columns."
  [row]
  (-> row
      (unwrap-column :text_search_vector)
      (unwrap-column :text_search_with_native_query_vector)))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn index-count
  "Count the number of documents in the index."
  [index]
  (let [result (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                  (-> (sql.helpers/select [:%count.* :count])
                                      (sql.helpers/from (keyword (:table-name index)))
                                      semantic.index/sql-format-quoted)
                                  {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    (or (:count result) 0)))

#_:clj-kondo/ignore
(defn full-index
  "Query the full index table and return all documents with decoded embeddings.
  Not used in tests, but useful for debugging."
  []
  (->> (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name mock-index)))
                          semantic.index/sql-format-quoted)
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (mapv decode-embedding)))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn query-embeddings
  "Query the `mock-index` table and return the decoded `:embedding`s for the given `model`"
  [{:keys [model model_id]}]
  (->> (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name mock-index)))
                          (sql.helpers/where :and
                                             [:= :model model]
                                             [:= :model_id model_id])
                          semantic.index/sql-format-quoted)
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (mapv decode-embedding)))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn query-tsvectors
  "Query the `mock-index` table and return the unwrapped tsvector columns for the given `model`"
  [{:keys [model model_id]}]
  (->> (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                      (-> (sql.helpers/select :model :model_id :content :creator_id
                                              :text_search_vector :text_search_with_native_query_vector)
                          (sql.helpers/from (keyword (:table-name mock-index)))
                          (sql.helpers/where :and
                                             [:= :model model]
                                             [:= :model_id model_id])
                          semantic.index/sql-format-quoted)
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (mapv unwrap-tsvectors)))

(defn check-index-has-no-mock-card []
  (testing "no mock card present"
    (is (= []
           (query-embeddings {:model "card"
                              :model_id "123"})))))

(defn check-index-has-no-mock-dashboard []
  (testing "no mock dashboard present"
    (is (= []
           (query-embeddings {:model "dashboard"
                              :model_id "456"})))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn check-index-has-no-mock-docs []
  (let [{:keys [table-name]}     mock-index
        table-exists-sql         "select exists(select * from information_schema.tables where table_name = ?) table_exists"
        [{:keys [table_exists]}] (jdbc/execute! (semantic.env/get-pgvector-datasource!) [table-exists-sql table-name])]
    (when table_exists
      (check-index-has-no-mock-card)
      (check-index-has-no-mock-dashboard))))

(defn check-index-has-mock-card []
  (is (= [{:model "card"
           :model_id "123"
           :creator_id 1
           :content "Dog Training Guide"
           :embedding (get-mock-embedding "Dog Training Guide")}]
         (query-embeddings {:model "card"
                            :model_id "123"}))))

(defn check-index-has-mock-dashboard []
  (is (= [{:model "dashboard"
           :model_id "456"
           :creator_id 2
           :content "Elephant Migration"
           :embedding (get-mock-embedding "Elephant Migration")}]
         (query-embeddings {:model "dashboard"
                            :model_id "456"}))))

(defn check-index-has-mock-docs []
  (check-index-has-mock-card)
  (check-index-has-mock-dashboard))

(defn spy [f]
  (let [calls (atom [])]
    {:calls calls
     :proxy (fn [& args]
              (let [ret (apply f args)]
                (swap! calls conj {:args args, :ret ret})
                ret))}))
