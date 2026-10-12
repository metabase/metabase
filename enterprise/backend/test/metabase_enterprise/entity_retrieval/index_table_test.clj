(ns metabase-enterprise.entity-retrieval.index-table-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(deftest legacy-meta-table-without-ownership-test
  (testing "a grant-only role neither attempts ALTER nor repeatedly warns"
    (log.capture/with-log-messages-for-level [messages [metabase-enterprise.entity-retrieval.index-table :warn]]
      (let [executed (atom [])]
        (with-redefs-fn {#'index-table/meta-column-exists?              (constantly false)
                         #'index-table/can-alter-meta-table?            (constantly false)
                         #'index-table/warned-about-missing-reconciled-at (atom #{})
                         #'jdbc/execute!                                (fn [& args] (swap! executed conj args))}
          #(dotimes [_ 2]
             (is (false? (#'index-table/ensure-reconciled-at-column! ::tx)))))
        (is (empty? @executed))
        (is (= 1 (count (messages)))))))
  (testing "freshness stamping is a no-op while the optional column is unavailable"
    (with-redefs-fn {#'index-table/meta-column-exists? (constantly false)
                     #'jdbc/execute!                   (fn [& _] (throw (AssertionError. "unexpected write")))}
      #(is (nil? (index-table/touch-reconciled-at! ::tx ::reconciled-at)))))
  (testing "freshness stamping persists the caller's pre-read watermark"
    (let [statement (atom nil)]
      (with-redefs-fn {#'index-table/meta-column-exists? (constantly true)
                       #'jdbc/execute!                   (fn [_ sql] (reset! statement sql))}
        #(index-table/touch-reconciled-at! ::tx ::reconciled-at))
      (is (= ::reconciled-at (second @statement))))))

(deftest alter-meta-table-requires-usable-owner-role-test
  (let [query (atom nil)]
    (with-redefs-fn {#'jdbc/execute-one! (fn [_ [sql & _] _]
                                           (reset! query sql)
                                           {:owns_table false})}
      #(is (false? (#'index-table/can-alter-meta-table? ::tx))))
    (is (re-find #"pg_has_role\(c\.relowner, 'USAGE'\)" @query)
        "a NOINHERIT member cannot use the owner role's ALTER privilege without SET ROLE")))

(deftest table-names-are-schema-qualified-test
  (testing "both stores put the index in its own schema, out of reach of a semantic-search wipe"
    (is (= {:schema  "library_retrieval"
            :vectors "library_retrieval.library_entity_index"
            :meta    "library_retrieval.library_entity_index_meta"}
           (index-table/tables))))
  (testing "rendered as separate identifiers"
    ;; interpolating the qualified name into "%s" would read as one identifier containing a dot
    (is (= "\"library_retrieval\".\"library_entity_index\"" (index-table/vectors-table-sql)))
    (is (= "\"library_retrieval\".\"library_entity_index_meta\"" (index-table/meta-table-sql)))))

(deftest schema-is-provisioned-test
  (let [statements (atom [])]
    (with-redefs-fn {#'jdbc/execute! (fn [_ sql] (swap! statements conj (first sql)) nil)}
      #(#'index-table/ensure-schema! ::tx))
    (is (= ["CREATE SCHEMA IF NOT EXISTS \"library_retrieval\""] @statements)
        "nothing else creates it: semantic search provisions its own, and we run without semantic search")))

(deftest incompatible-legacy-tables-are-dropped-test
  (let [statements (atom [])
        located    (atom {"library_entity_index"      {:schema-name "legacy.with.dot"
                                                       :table-name  "library_entity_index"}
                          "library_entity_index_meta" {:schema-name "legacy.with.dot"
                                                       :table-name  "library_entity_index_meta"}})]
    (with-redefs-fn {#'index-table/legacy-table-in-search-path (fn [_ table] (get @located table))
                     #'jdbc/execute!                           (fn [_ sql] (swap! statements conj (first sql)) nil)
                     #'semantic.db.datasource/db-url           "jdbc:postgresql://stub"}
      (fn []
        (testing "an index built before immutable space identity is discarded"
          (#'index-table/drop-legacy-tables! ::tx)
          (is (= ["DROP TABLE \"legacy.with.dot\".\"library_entity_index\""
                  "DROP TABLE \"legacy.with.dot\".\"library_entity_index_meta\""]
                 @statements)))
        (testing "there is nothing to do after the legacy tables are gone"
          (reset! statements [])
          (reset! located {})
          (#'index-table/drop-legacy-tables! ::tx)
          (is (empty? @statements)))
        (testing "same-named app db tables are never dropped"
          (reset! statements [])
          (reset! located {"library_entity_index"      {:schema-name "public"
                                                        :table-name  "library_entity_index"}
                           "library_entity_index_meta" {:schema-name "public"
                                                        :table-name  "library_entity_index_meta"}})
          (with-redefs [semantic.db.datasource/db-url nil]
            (#'index-table/drop-legacy-tables! ::tx))
          (is (empty? @statements)
              "application tables with the legacy names do not belong to the library index"))))))

(deftest ^:synchronized incompatible-legacy-tables-are-replaced-in-a-dedicated-store-test
  (testing "old vectors without immutable space identity are replaced with current empty tables"
    (when (semantic.db.datasource/dedicated-url-configured?)
      ;; its own database: cleanup only runs under the real table names, which a shared store may hold
      (semantic.tu/with-test-db! {:dbname "library_retrieval_adoption_test" :mode :blank :cleanup :both}
        (let [pgvector (semantic.db.datasource/ensure-initialized-data-source!)]
          (jdbc/execute! pgvector ["CREATE EXTENSION IF NOT EXISTS vector"])
          (jdbc/with-transaction [tx pgvector]
            (jdbc/execute! tx ["CREATE SCHEMA \"legacy.retrieval\""])
            (jdbc/execute! tx ["SET LOCAL search_path TO \"legacy.retrieval\", public"])
            ;; both bare names and the metadata shape the index carried before immutable space identity
            (jdbc/execute! tx ["CREATE TABLE library_entity_index
                                (doc_id text primary key, entity_type text, entity_local_id bigint,
                                 doc_type text, doc_text text, doc_embedding vector(4))"])
            (jdbc/execute! tx ["INSERT INTO library_entity_index
                                VALUES ('legacy-doc', 'table', 1, 'name', 'legacy', '[0,0,0,0]')"])
            (jdbc/execute! tx ["CREATE TABLE library_entity_index_meta
                                (id smallint primary key, provider text, model_name text,
                                 vector_dimensions int, schema_version int,
                                 updated_at timestamptz, reconciled_at timestamptz)"])
            (jdbc/execute! tx ["INSERT INTO library_entity_index_meta
                                VALUES (1, ?, ?, ?, ?, now(), now())"
                               (:provider semantic.tu/mock-embedding-model)
                               (:model-name semantic.tu/mock-embedding-model)
                               (:vector-dimensions semantic.tu/mock-embedding-model)
                               index-table/schema-version])
            (#'index-table/drop-legacy-tables! tx))
          (is (= :created (index-table/ensure-tables! pgvector semantic.tu/mock-embedding-model)))
          (is (empty? (jdbc/execute! pgvector
                                     [(format "SELECT doc_id FROM %s" (index-table/vectors-table-sql))]
                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
              "unknown legacy vectors are not relabeled as the current embedding space")
          (is (empty? (jdbc/execute! pgvector
                                     [(str "SELECT schemaname, tablename FROM pg_tables"
                                           " WHERE schemaname <> 'library_retrieval'"
                                           " AND tablename LIKE 'library_entity_index%'")]))
              "the incompatible tables do not remain in their custom search-path schema"))))))

(deftest reconcile-watermark-precedes-appdb-read-test
  (let [events (atom [])]
    (mt/with-dynamic-fn-redefs [reconcile/capture-reconcile-watermark (fn [_]
                                                                        (swap! events conj :clock)
                                                                        ::reconciled-at)
                                reconcile/desired-docs                (fn []
                                                                        (swap! events conj :appdb-read)
                                                                        [])
                                reconcile/stored-docs                 (constantly {})
                                reconcile/delete-rows!                (fn [& _])
                                reconcile/index-size                  (constantly {:documents 0 :entities 0})
                                index-table/touch-reconciled-at!      (fn [_ reconciled-at]
                                                                        (swap! events conj [:watermark reconciled-at]))]
      (#'reconcile/reconcile-against-appdb! ::conn ::embedding-model))
    (is (= [:clock :appdb-read [:watermark ::reconciled-at]] @events))))
