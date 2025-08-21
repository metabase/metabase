(ns metabase-enterprise.semantic-search.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :refer [env]]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.core]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.protocols :as jdbc.protocols]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (clojure.lang IDeref)
   (com.mchange.v2.c3p0 PooledDataSource)
   (java.io Closeable)
   (java.time Instant)))

(set! *warn-on-reflection* true)

;; If I won't find any use for following muted code in follow-up tasks I'll delete it -- lbrdnk

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

(defn do-with-test-db!
  "Impl [[with-test-db]]"
  [db-name thunk]
  (with-temp-datasource! "postgres"
    (try
      (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                     [(str "DROP DATABASE IF EXISTS " db-name " (FORCE)")])
      (log/fatal "creating database")
      (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                     [(str "CREATE DATABASE " db-name)])
      (log/fatal "created database")
      (catch java.sql.SQLException e
        (log/fatal "creation failed")
        (throw e))))
  (with-temp-datasource! db-name
    (thunk)))

(defmacro with-test-db!
  "Drop, create database dbname on pgvector and redefine datasource accordingly. Not thread safe."
  [db-name & body]
  `(do-with-test-db! ~db-name (fn [] ~@body)))

(def ^:private init-delay
  (delay
    (when-not @semantic.db.datasource/data-source
      (semantic.db.datasource/init-db!))))

(defn once-fixture [f]
  (when semantic.db.datasource/db-url
    @init-delay
    (f)))

(declare db)

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn ensure-no-migration-table-fixture [f]
  (semantic.db.migration/drop-migration-table! db)
  (f)
  (semantic.db.migration/drop-migration-table! db))

(def db
  "Proxies the semantic.db.datasource/data-source, avoids the deref and prettifies a little"
  ;; proxy because semantic.db.datasource/data-source is not initialised until the fixture runs
  (reify jdbc.protocols/Sourceable
    (get-datasource [_] (jdbc.protocols/get-datasource @semantic.db.datasource/data-source))))

(comment
  (jdbc/execute! db ["select 1"]))

(def mock-embeddings
  "Static mapping from strings to (made-up) 4-dimensional embedding vectors for testing. Each pair of strings represents a
  document and a search query that should be most semantically similar to it, according to the embeddings."
  {"Dog Training Guide"    [0.12 -0.34  0.56 -0.78]
   "puppy"                 [0.13 -0.33  0.57 -0.77]
   "Bird Watching Tips"    [0.23  0.45 -0.67  0.89]
   "avian"                 [0.24  0.46 -0.66  0.88]
   "Cat Behavior Study"    [0.11 -0.22  0.33 -0.44]
   "feline"                [0.12 -0.21  0.34 -0.43]
   "Horse Racing Analysis" [0.55  0.66 -0.77  0.88]
   "equine"                [0.56  0.67 -0.76  0.87]
   "Fish Tank Setup"       [0.10  0.20 -0.30  0.40]
   "aquatic"               [0.11  0.21 -0.29  0.39]
   "Elephant Migration"    [0.15 -0.25  0.35 -0.45]
   "pachyderm"             [0.16 -0.24  0.36 -0.44]
   "Lion Pride Dynamics"   [0.31  0.42 -0.53  0.64]
   "predator"              [0.32  0.43 -0.52  0.63]
   "Penguin Colony Study"  [0.75 -0.86  0.97 -0.18]
   "Antarctic wildlife"    [0.76 -0.85  0.96 -0.17]
   "Whale Communication"   [0.29  0.38 -0.47  0.56]
   "marine mammal"         [0.30  0.39 -0.46  0.55]
   "Tiger Conservation"    [0.65 -0.74  0.83 -0.92]
   "endangered species"    [0.66 -0.73  0.84 -0.91]
   "Butterfly Migration"   [0.17  0.28 -0.39  0.50]
   "insect patterns"       [0.18  0.29 -0.38  0.49]})

(defn get-mock-embedding
  "Lookup the embedding for `text` in [[mock-embeddings]]."
  [text]
  (get mock-embeddings text [0.01 0.02 0.03 0.04]))

(defn get-mock-embeddings-batch
  "Lookup embeddings for multiple texts in [[mock-embeddings]]."
  [texts]
  (mapv get-mock-embedding texts))

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

(def mock-index
  "A mock index for testing low level indexing functions.
  Coincides with what the index-metadata system would create for the mock-embedding-model."
  (-> (semantic.index/default-index mock-embedding-model)
      (semantic.index-metadata/qualify-index mock-index-metadata)))

(defmethod semantic.embedding/get-embedding        "mock" [_ text] (get-mock-embedding text))
(defmethod semantic.embedding/get-embeddings-batch "mock" [_ texts] (get-mock-embeddings-batch texts))
(defmethod semantic.embedding/pull-model           "mock" [_])

(defn query-index [search-context]
  (:results (semantic.index/query-index db mock-index search-context)))

(defn upsert-index! [documents & opts]
  (apply semantic.index/upsert-index! db mock-index documents opts))

(defn delete-from-index! [model ids]
  (semantic.index/delete-from-index! db mock-index model ids))

(defn dog-training-native-query []
  (mt/native-query {:query "SELECT AVG(tricks) FROM dogs WHERE age > 7 GROUP BY breed"}))

(defn mock-documents []
  (let [native-query-json (-> (dog-training-native-query) json/encode)]
    [{:model "card"
      :id 123
      :name "Dog Training Guide"
      :searchable_text "Dog Training Guide"
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
      :created_at #t "2025-02-01T12:00:00Z"
      :creator_id 2
      :archived true
      :legacy_input {:model "dashboard" :id 456}
      :metadata {:title "Elephant Migration" :description "How do elephants deal with schema upgrades?"}}]))

(defn filter-for-mock-embeddings
  "Filter results to only include items whose names are keys in mock-embeddings map."
  [results]
  (filter #(contains? mock-embeddings (:name %)) results))

(defn closeable [o close-fn]
  (reify
    IDeref
    (deref [_] o)
    Closeable
    (close [_] (close-fn o))))

(defn open-temp-index! ^Closeable []
  (closeable
   (do (semantic.index/create-index-table-if-not-exists! db mock-index {:force-reset? true})
       mock-index)
   (fn cleanup-temp-index-table! [{:keys [table-name]}]
     (try
       (semantic.index/drop-index-table! db mock-index)
       (catch Exception e
         (log/error e "Warning: failed to clean up test table" table-name))))))

(declare cleanup-index-metadata!)

(defn open-temp-index-and-metadata! ^Closeable []
  (closeable
   (do (cleanup-index-metadata! db mock-index-metadata)
       (semantic.pgvector-api/init-semantic-search! db mock-index-metadata mock-embedding-model)
       mock-index-metadata)
   (fn cleanup-temp-index-and-metadata! [index-metadata]
     (try
       (cleanup-index-metadata! db index-metadata)
       (catch Exception e
         (log/error e "Warning: failed to clean up index and metadata" index-metadata))))))

(defmacro with-indexable-documents!
  "Add a collection of test documents to that can be indexed to the appdb."
  [& body]
  `(mt/dataset ~(symbol "test-data")
     (mt/with-temp [:model/Collection       {col1# :id}  {:name "Wildlife Collection" :archived false}

                    :model/Collection       {col2# :id}  {:name "Archived Animals" :archived true}

                    :model/Collection       {col3# :id}  {:name "Cryptozoology", :archived false}

                    :model/Card             {card1# :id} {:name "Dog Training Guide" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false
                                                          :query_type "native" :dataset_query (dog-training-native-query)}

                    :model/Card             {}           {:name "Bird Watching Tips" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Card             {}           {:name "Cat Behavior Study" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}

                    :model/Card             {}           {:name "Horse Racing Analysis" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Card             {}           {:name "Fish Tank Setup" :collection_id col2# :creator_id (mt/user->id :crowberto) :archived true}

                    :model/Card             {}           {:name "Bigfoot Sightings" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}

                    :model/ModerationReview {}           {:moderated_item_type "card"
                                                          :moderated_item_id card1#
                                                          :moderator_id (mt/user->id :crowberto)
                                                          :status "verified"
                                                          :most_recent true}

                    :model/Dashboard        {}           {:name "Elephant Migration" :collection_id col1# :creator_id (mt/user->id :rasta) :archived false}

                    :model/Dashboard        {}           {:name "Lion Pride Dynamics" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}

                    :model/Dashboard        {}           {:name "Penguin Colony Study" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}

                    :model/Dashboard        {}           {:name "Whale Communication" :collection_id col1# :creator_id (mt/user->id :crowberto) :archived false}

                    :model/Dashboard        {}           {:name "Tiger Conservation" :collection_id col2# :creator_id (mt/user->id :rasta) :archived true}

                    :model/Dashboard        {}           {:name "Loch Ness Stuff" :collection_id col3# :creator_id (mt/user->id :crowberto), :archived false}

                    :model/Database         {db-id# :id} {:name "Animal Database"}

                    :model/Table            {}           {:name "Species Table", :db_id db-id#}

                    :model/Table            {}           {:name "Monsters Table", :db_id db-id#, :active true}]
       ~@body)))

(defn index-all!
  "Run indexer synchonously until we've exhausted polling all documents"
  []
  (let [metadata-row   {:indexer_last_poll Instant/EPOCH
                        :indexer_last_seen Instant/EPOCH}
        indexing-state (semantic.indexer/init-indexing-state metadata-row)
        step (fn [] (semantic.indexer/indexing-step db mock-index-metadata mock-index indexing-state))]
    (while (do (step) (pos? (:last-indexed-count @indexing-state))))))

(defmacro blocking-index!
  "Execute body ensuring [[index-all!]] is invoked at the end"
  [& body]
  `(let [ret# (do ~@body)]
     (index-all!)
     ret#))

(defmacro with-index!
  "Ensure a clean, small index for testing populated with a few collections, cards, and dashboards."
  [& body]
  `(with-indexable-documents!
     (with-redefs [semantic.embedding/get-configured-model        (fn [] mock-embedding-model)
                   semantic.index-metadata/default-index-metadata mock-index-metadata]
       (with-open [_# (open-temp-index-and-metadata!)]
         (binding [search.ingestion/*force-sync* true]
           (blocking-index!
            (search.core/reindex! :search.engine/semantic {:force-reset true}))
           ~@body)))))

(defn table-exists-in-db?
  "Check if a table actually exists in the database"
  [table-name]
  (when table-name
    (try
      (let [result (jdbc/execute! db
                                  ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)"
                                   (name table-name)])]
        (-> result first vals first))
      (catch Exception _ false))))

(defn table-has-index?
  [table-name index-name]
  (when table-name
    (try
      (let [result (jdbc/execute! db
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
  (doseq [{:keys [table_name]}
          (when (table-exists-in-db? (:metadata-table-name index-metadata))
            (get-metadata-rows pgvector index-metadata))]
    (semantic.index/drop-index-table! pgvector {:table-name table_name}))
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

#_:clj-kondo/ignore
(defn full-index
  "Query the full index table and return all documents with decoded embeddings.
  Not used in tests, but useful for debugging."
  []
  (->> (jdbc/execute! db
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name mock-index)))
                          semantic.index/sql-format-quoted)
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (mapv decode-embedding)))

(defn query-embeddings
  "Query the `mock-index` table and return the decoded `:embedding`s for the given `model`"
  [{:keys [model model_id]}]
  (->> (jdbc/execute! db
                      (-> (sql.helpers/select :model :model_id :content :creator_id :embedding)
                          (sql.helpers/from (keyword (:table-name mock-index)))
                          (sql.helpers/where :and
                                             [:= :model model]
                                             [:= :model_id model_id])
                          semantic.index/sql-format-quoted)
                      {:builder-fn jdbc.rs/as-unqualified-lower-maps})
       (mapv decode-embedding)))

(defn query-tsvectors
  "Query the `mock-index` table and return the unwrapped tsvector columns for the given `model`"
  [{:keys [model model_id]}]
  (->> (jdbc/execute! db
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

(defn check-index-has-no-mock-docs []
  (let [{:keys [table-name]}     mock-index
        table-exists-sql         "select exists(select * from information_schema.tables where table_name = ?) table_exists"
        [{:keys [table_exists]}] (jdbc/execute! db [table-exists-sql table-name])]
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
