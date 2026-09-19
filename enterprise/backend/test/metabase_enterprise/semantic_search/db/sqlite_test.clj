(ns metabase-enterprise.semantic-search.db.sqlite-test
  "The SQLite semantic search store. Needs no database of its own -- each test opens a file under a temp directory --
  so, unlike the rest of the semantic-search suite, it always runs."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.sqlite :as semantic.db.sqlite]
   [metabase-enterprise.semantic-search.db.store-health :as semantic.store-health]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.task.index-cleanup :as semantic.index-cleanup]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (com.mchange.v2.c3p0 PooledDataSource)
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.sql Timestamp)
   (java.time Instant LocalDate OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(defn- temp-db-path []
  (str (.toFile (Files/createTempDirectory "semantic-sqlite-test" (make-array FileAttribute 0)))
       File/separator "semantic.db"))

(defn- do-with-store
  "Call `(f ds)` with a pooled data source over a fresh SQLite file."
  [f]
  (let [^PooledDataSource ds (semantic.db.sqlite/pooled-data-source (temp-db-path))]
    (try
      (f ds)
      (finally
        (.close ds)))))

(defn- query-one! [ds sql-params]
  (jdbc/execute-one! ds sql-params {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

;;; ------------------------------------------------ Mode selection ------------------------------------------------

(deftest dedicated-mode-wins-over-sqlite-test
  (testing "MB_PGVECTOR_DB_URL wins over MB_SEMANTIC_SEARCH_SQLITE_PATH"
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://localhost:5432/pgvector"
                  semantic.db.sqlite/db-path    "/tmp/semantic.db"]
      (is (= :dedicated (semantic.db.datasource/pgvector-mode)))
      (is (false? (semantic.db.datasource/sqlite?))))))

(deftest sqlite-mode-test
  (testing "MB_SEMANTIC_SEARCH_SQLITE_PATH selects the SQLite store over the app db, without probing the app db"
    (doseq [db-type [:postgres :h2 :mysql]]
      (with-redefs [semantic.db.datasource/db-url nil
                    semantic.db.sqlite/db-path    "/tmp/semantic.db"
                    mdb/db-type                   (constantly db-type)
                    semantic.db.datasource/check-app-db-pgvector-support
                    (fn [] (throw (AssertionError. "must not probe the app db")))]
        (is (= :sqlite (semantic.db.datasource/pgvector-mode)))
        (is (semantic.db.datasource/sqlite?))
        (is (semantic.db.datasource/pgvector-configured?))
        (testing "Postgres-only features don't count it as a pgvector store"
          (is (false? (semantic.db.datasource/postgres-store?)))))))
  (testing "a blank path counts as unset"
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.sqlite/db-path    "  "
                  mdb/db-type                   (constantly :h2)]
      (is (false? (semantic.db.datasource/sqlite?)))
      (is (= :unavailable (semantic.db.datasource/pgvector-mode))))))

(deftest sqlite-semantic-search-configured-test
  (testing "a SQLite store schedules the semantic-search tasks on any app db"
    (mt/with-premium-features #{:semantic-search}
      (with-redefs [semantic.db.datasource/db-url nil
                    semantic.db.sqlite/db-path    "/tmp/semantic.db"
                    mdb/db-type                   (constantly :h2)]
        (is (true? (semantic.util/semantic-search-configured?)))))))

(deftest sqlite-probe-store-test
  (let [probe @#'semantic.store-health/probe-store]
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.sqlite/db-path    "/tmp/semantic.db"]
      (testing "a SQLite store is resolved from config alone, without asking the app db"
        (mt/with-dynamic-fn-redefs
          [mdb/db-is-set-up?                               #(throw (ex-info "must not ask the app db" {}))
           semantic.db.datasource/probe-sqlite-connection! (constantly {:test 1})]
          (is (=? {:mode :sqlite, :connected? true, :resolved? true} (probe)))))
      (testing "a store that fails to open reads as disconnected, but the store is still known"
        (mt/with-dynamic-fn-redefs
          [semantic.db.datasource/probe-sqlite-connection! #(throw (ex-info "nope" {}))]
          (is (=? {:mode :sqlite, :connected? false, :resolved? true} (probe))))))))

;;; ------------------------------------------------- Pure helpers -------------------------------------------------

(deftest ^:parallel vector-blob-round-trip-test
  (testing "embeddings encode as float32 little-endian BLOBs"
    (let [blob (semantic.db.sqlite/vector->blob [1.0 -2.5 0.125])]
      (is (= 12 (alength blob)))
      (is (= [0 0 -128 63] (vec (take 4 blob))) "1.0f, little-endian")))
  (testing "decoding hands back the shortest decimal for each float, as pgvector prints them"
    (is (= [0.12 -0.34 0.56 -0.78]
           (semantic.db.sqlite/blob->vector (semantic.db.sqlite/vector->blob [0.12 -0.34 0.56 -0.78])))))
  (testing "non-numeric values are rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"non-numeric"
                          (semantic.db.sqlite/vector->blob [1.0 "2"])))))

(deftest ^:parallel cosine-distance-test
  (let [d #(semantic.db.sqlite/cosine-distance (semantic.db.sqlite/vector->blob %1) (semantic.db.sqlite/vector->blob %2))]
    (testing "matches pgvector's <=>: 0 for the same direction, 1 when orthogonal, 2 when opposed"
      (is (< (Math/abs (double (d [1 2 3] [2 4 6]))) 1e-6))
      (is (= 1.0 (d [1 0] [0 1])))
      (is (= 2.0 (d [1 0] [-1 0]))))
    (testing "a zero vector has no direction"
      (is (Double/isNaN (d [0 0] [1 1]))))
    (testing "vectors of different dimensions can't be compared"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"different vector dimensions 2 and 3"
                            (d [1 0] [1 0 0]))))))

(deftest ^:parallel timestamp-text-test
  (testing "timestamps encode as fixed-width UTC text with microsecond precision"
    (is (= "2026-01-02T03:04:05.000000Z" (semantic.db.sqlite/->timestamp-text (Instant/parse "2026-01-02T03:04:05Z"))))
    (is (= "2026-01-02T03:04:05.123456Z"
           (semantic.db.sqlite/->timestamp-text (Timestamp/from (Instant/parse "2026-01-02T03:04:05.123456789Z")))))
    (is (= "2026-01-02T01:04:05.000000Z"
           (semantic.db.sqlite/->timestamp-text (OffsetDateTime/of 2026 1 2 3 4 5 0 (ZoneOffset/ofHours 2))))))
  (testing "so text order is time order"
    (let [instants [(Instant/parse "2026-01-02T03:04:05Z")
                    (Instant/parse "2026-01-02T03:04:05.000001Z")
                    (Instant/parse "2026-01-02T03:04:05.1Z")
                    (Instant/parse "2026-01-02T03:04:06Z")]]
      (is (= (map semantic.db.sqlite/->timestamp-text instants)
             (sort (map semantic.db.sqlite/->timestamp-text instants))))))
  (testing "a date encodes as its day, which sorts as that day's midnight"
    (is (= "2026-01-02" (semantic.db.sqlite/->timestamp-text (LocalDate/of 2026 1 2))))
    (is (neg? (compare "2026-01-02" (semantic.db.sqlite/->timestamp-text (Instant/parse "2026-01-02T00:00:00Z")))))))

(deftest ^:parallel search-string->fts5-query-test
  (are [search-string expected] (= expected (semantic.db.sqlite/search-string->fts5-query search-string))
    "dog"                  "(\"dog\"*)"
    "Dog Training"         "(\"dog\" AND \"training\"*)"
    "dog or cat"           "(\"dog\") OR (\"cat\"*)"
    "orders and products"  "(\"orders\" AND \"products\"*)"
    "\"dog training\""     "(\"dog training\")"
    "\"dog train"          "(\"dog train\"*)"
    "dog -cat"             "(\"dog\") NOT \"cat\""
    ;; FTS5's NOT is binary, so a clause of only negations can't match anything
    "-cat"                 nil
    "  "                   nil
    nil                    nil
    ;; punctuation can't smuggle query syntax in
    "a\"b"                 "(\"a\" AND \"b\"*)"
    "x) OR (y"             "(\"x)\") OR (\"(y\"*)"
    "- \""                 nil))

;;; -------------------------------------------- Connections and SQL --------------------------------------------

(deftest ^:synchronized postgres-compatibility-functions-test
  (do-with-store
   (fn [ds]
     (testing "clock_timestamp() and now() answer the stored timestamp format"
       (is (re-matches #"<\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z>"
                       (:t (query-one! ds ["SELECT '<' || clock_timestamp() || '>' AS t"]))))
       (is (=? {:t #(instance? Timestamp %) :n #(instance? Timestamp %)}
               (query-one! ds ["SELECT clock_timestamp() AS t, now() AS n"]))))
     (testing "greatest/least ignore NULLs, like Postgres"
       (is (= {:g 2.5 :l 1 :n nil}
              (query-one! ds ["SELECT greatest(1, NULL, 2.5) AS g, least(3, NULL, 1) AS l, greatest(NULL) AS n"]))))
     (testing "regexp_replace replaces every match only with the g flag"
       (is (= {:all "a b c" :first "a b  c"}
              (query-one! ds ["SELECT regexp_replace('a   b  c', '\\s+', ' ', 'g') AS \"all\", regexp_replace('a   b  c', '\\s+', ' ') AS \"first\""]))))
     (testing "vec_distance_cosine compares BLOB embeddings, NULL for a zero vector"
       (is (= {:d 1.0 :z nil}
              (query-one! ds ["SELECT vec_distance_cosine(?, ?) AS d, vec_distance_cosine(?, ?) AS z"
                              (semantic.db.sqlite/vector->blob [1 0]) (semantic.db.sqlite/vector->blob [0 1])
                              (semantic.db.sqlite/vector->blob [0 0]) (semantic.db.sqlite/vector->blob [0 1])]))))
     (testing "every pooled connection gets the functions, including those opened concurrently"
       (is (= (repeat 16 1)
              (pmap (fn [_] (with-open [conn (jdbc/get-connection ds)]
                              (:ok (query-one! conn ["SELECT 1 AS ok FROM (SELECT vec_distance_cosine(x'0000803f', x'0000803f'))"]))))
                    (range 16)))))
     (testing "the store runs in WAL mode"
       (is (= "wal" (:journal_mode (query-one! ds ["PRAGMA journal_mode"]))))))))

(deftest ^:synchronized jdbc-adapter-test
  (do-with-store
   (fn [ds]
     (jdbc/execute! ds ["CREATE TABLE t (id INTEGER PRIMARY KEY, at TIMESTAMP, flag BOOLEAN, label TEXT)"])
     (testing "every kind of date-time binds as timestamp text"
       (let [instant (Instant/parse "2026-01-02T03:04:05.123456Z")]
         (doseq [[id v] [[1 instant]
                         [2 (Timestamp/from instant)]
                         [3 (OffsetDateTime/ofInstant instant (ZoneOffset/ofHours -5))]]]
           (jdbc/execute! ds ["INSERT INTO t (id, at, flag, label) VALUES (?, ?, ?, ?)" id v true "x"]))
         ;; bracketed, since the adapter would otherwise read timestamp text back as a Timestamp
         (is (= #{"<2026-01-02T03:04:05.123456Z>"}
                (set (map :at (jdbc/execute! ds ["SELECT '<' || at || '>' AS at FROM t"]
                                             {:builder-fn jdbc.rs/as-unqualified-lower-maps})))))))
     (testing "reads come back as pgjdbc would return them"
       (is (=? {:at    #(= (Timestamp/from (Instant/parse "2026-01-02T03:04:05.123456Z")) %)
                :flag  true
                :label "x"
                :n     #(instance? Long %)
                :now   #(instance? Timestamp %)}
               (query-one! ds ["SELECT at, flag, label, (SELECT count(*) FROM t) AS n, clock_timestamp() AS now FROM t WHERE id = 1"]))))
     (testing "a date binds as its day and compares against stored timestamps"
       (is (= 3 (:n (query-one! ds ["SELECT count(*) AS n FROM t WHERE at BETWEEN ? AND ?"
                                    (LocalDate/of 2026 1 2) (LocalDate/of 2026 1 3)]))))))))

;;; ------------------------------------------------- End to end -------------------------------------------------

(defmacro ^:private with-sqlite-harness
  "Run `body` against the semantic-search test harness in SQLite mode, whatever store the rest of the run uses."
  [& body]
  `(mt/with-dynamic-fn-redefs [semantic.tu/sqlite-mode? (constantly true)]
     ~@body))

(deftest ^:synchronized sqlite-index-and-search-test
  (mt/with-premium-features #{:semantic-search}
    (mt/as-admin
      (with-sqlite-harness
        (semantic.tu/with-test-db! {:mode :mock-indexed :cleanup :both}
          (testing "the harness really is on SQLite"
            (is (= :sqlite (semantic.db.datasource/pgvector-mode)))
            (is (semantic.util/sqlite?)))
          (testing "the gated documents were indexed"
            (is (pos? (semantic.index/index-size (semantic.env/get-pgvector-datasource!)
                                                 (:table-name semantic.tu/mock-index)))))
          (testing "vector search finds the semantically closest content"
            (semantic.tu/with-only-semantic-weights
              (is (= "Dog Training Guide"
                     (-> (semantic.tu/query-index {:search-string "puppy"}) semantic.tu/filter-for-mock-embeddings first :name)))
              (is (= "Bird Watching Tips"
                     (-> (semantic.tu/query-index {:search-string "avian"}) semantic.tu/filter-for-mock-embeddings first :name)))
              (testing "HNSW strategies fall back to the exact scan"
                (is (= "Dog Training Guide"
                       (-> (semantic.tu/query-index {:search-string "puppy" :vector-search-strategy :hnsw})
                           semantic.tu/filter-for-mock-embeddings first :name))))))
          (testing "filters apply"
            (let [results (semantic.tu/query-index {:search-string "feline" :archived? true})]
              (is (seq results))
              (is (every? :archived results))))
          (testing "keyword search (FTS5) surfaces a match the vector arm scores poorly"
            ;; "Whale" has no mock embedding of its own, so only the keyword arm can find it
            (semantic.tu/with-weights {:rrf 1}
              (is (= "Whale Communication"
                     (-> (semantic.tu/query-index {:search-string "whale"}) first :name)))))
          (testing "deletes reach the index"
            (let [{:keys [id]} (->> (semantic.tu/query-index {:search-string "puppy"})
                                    (filter #(= "Dog Training Guide" (:name %)))
                                    first)]
              (semantic.tu/delete-from-index! "card" [id])
              (is (not-any? #(= "Dog Training Guide" (:name %))
                            (semantic.tu/query-index {:search-string "puppy"}))))))))))

(deftest ^:synchronized sqlite-drop-index-table-test
  (with-sqlite-harness
    (semantic.tu/with-test-db! {:cleanup :both}
      (let [ds (semantic.env/get-pgvector-datasource!)]
        (with-open [_ (semantic.tu/open-temp-index!)]
          (testing "the index table comes with its FTS5 table"
            (is (semantic.util/table-exists? ds (:table-name semantic.tu/mock-index)))
            (is (semantic.util/table-exists? ds (semantic.index/fts-table-name (:table-name semantic.tu/mock-index))))))
        (testing "and dropping the index drops both"
          (is (not (semantic.util/table-exists? ds (:table-name semantic.tu/mock-index))))
          (is (not (semantic.util/table-exists? ds (semantic.index/fts-table-name (:table-name semantic.tu/mock-index))))))))))

(deftest ^:synchronized sqlite-orphan-index-cleanup-test
  (with-sqlite-harness
    (semantic.tu/with-test-db! {:cleanup :both}
      (let [ds             (semantic.env/get-pgvector-datasource!)
            index-metadata (semantic.tu/unique-index-metadata)
            qualify        #(format (:index-table-qualifier index-metadata) %)
            orphan         (qualify "index_ollama_orphantest_1024")
            registered     (qualify "index_ollama_registered_1024")
            not-an-index   (qualify "index_not_an_index")]
        (with-open [_ (semantic.tu/open-metadata! ds index-metadata)]
          (doseq [t [orphan not-an-index]]
            (jdbc/execute! ds [(format "CREATE TABLE \"%s\" (id INTEGER PRIMARY KEY)" t)]))
          (semantic.index/create-index-table-if-not-exists!
           ds (assoc semantic.tu/mock-index :table-name registered))
          (jdbc/execute! ds [(format (str "INSERT INTO \"%s\" (provider, model_name, vector_dimensions,"
                                          " embedding_space_id, table_name, index_version, index_created_at)"
                                          " VALUES ('mock', 'model', 4, 'space', ?, 5, now())")
                                     (:metadata-table-name index-metadata))
                             registered])
          (testing "only unregistered index-shaped tables are orphans; FTS shadow tables are never candidates"
            (is (= [orphan] (#'semantic.index-cleanup/orphan-index-tables ds index-metadata)))))))))
