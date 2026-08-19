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

(deftest legacy-tables-are-moved-not-rebuilt-test
  (let [statements (atom [])
        exists     (atom #{"library_entity_index" "library_entity_index_meta"})]
    (with-redefs-fn {#'index-table/table-exists?        (fn [_ table] (contains? @exists table))
                     #'jdbc/execute!                    (fn [_ sql] (swap! statements conj (first sql)) nil)
                     #'semantic.db.datasource/db-url    "jdbc:postgresql://stub"}
      (fn []
        (testing "an index built before the schema existed is moved, keeping its rows"
          (#'index-table/adopt-legacy-tables! ::tx)
          (is (= ["ALTER TABLE \"library_entity_index\" SET SCHEMA \"library_retrieval\""
                  "ALTER TABLE \"library_entity_index_meta\" SET SCHEMA \"library_retrieval\""]
                 @statements)))
        (testing "and left alone once moved"
          (reset! statements [])
          (reset! exists #{"library_retrieval.library_entity_index"
                           "library_retrieval.library_entity_index_meta"})
          (#'index-table/adopt-legacy-tables! ::tx)
          (is (empty? @statements)))
        (testing "a qualified table standing beside a leftover legacy one keeps its rows"
          (reset! statements [])
          (reset! exists #{"library_entity_index"
                           "library_entity_index_meta"
                           "library_retrieval.library_entity_index"
                           "library_retrieval.library_entity_index_meta"})
          (#'index-table/adopt-legacy-tables! ::tx)
          (is (empty? @statements)
              "SET SCHEMA onto an occupied name errors, aborting the whole ensure-tables! transaction"))
        (testing "an app db is never adopted from: nothing there can be an old index of ours"
          (reset! statements [])
          (reset! exists #{"library_entity_index" "library_entity_index_meta"})
          (with-redefs [semantic.db.datasource/db-url nil]
            (#'index-table/adopt-legacy-tables! ::tx))
          (is (empty? @statements)
              "an application table on the search path answers to the bare name, and must not be moved"))))))

(deftest ^:synchronized legacy-tables-are-adopted-in-a-dedicated-store-test
  (testing "a real SET SCHEMA carries the rows an upgrading dedicated store already embedded"
    (when (semantic.db.datasource/dedicated-url-configured?)
      ;; its own database: adoption only runs under the real table names, which a shared store may hold
      (semantic.tu/with-test-db! {:dbname "library_retrieval_adoption_test" :mode :blank :cleanup :both}
        (let [pgvector (semantic.db.datasource/ensure-initialized-data-source!)]
          (jdbc/execute! pgvector ["CREATE EXTENSION IF NOT EXISTS vector"])
          ;; both bare names the index carried before it had a schema of its own, with a meta row for the
          ;; model it was built against -- an upgrade the reconciler should find nothing to redo
          (jdbc/execute! pgvector ["CREATE TABLE library_entity_index
                                    (doc_id text primary key, entity_type text, entity_local_id bigint,
                                     doc_type text, doc_text text, doc_embedding vector(4))"])
          (jdbc/execute! pgvector ["INSERT INTO library_entity_index
                                    VALUES ('legacy-doc', 'table', 1, 'name', 'legacy', '[0,0,0,0]')"])
          (jdbc/execute! pgvector ["CREATE TABLE library_entity_index_meta
                                    (id smallint primary key, provider text, model_name text,
                                     vector_dimensions int, schema_version int,
                                     updated_at timestamptz, reconciled_at timestamptz)"])
          (jdbc/execute! pgvector ["INSERT INTO library_entity_index_meta
                                    VALUES (1, ?, ?, ?, ?, now(), now())"
                                   (:provider semantic.tu/mock-embedding-model)
                                   (:model-name semantic.tu/mock-embedding-model)
                                   (:vector-dimensions semantic.tu/mock-embedding-model)
                                   index-table/schema-version])
          (is (= :ok (index-table/ensure-tables! pgvector semantic.tu/mock-embedding-model))
              "the adopted meta row still describes the configured model, so nothing is rebuilt")
          (is (= ["legacy-doc"]
                 (map :doc_id (jdbc/execute! pgvector
                                             [(format "SELECT doc_id FROM %s" (index-table/vectors-table-sql))]
                                             {:builder-fn jdbc.rs/as-unqualified-lower-maps})))
              "moved, not recreated empty -- otherwise the whole library re-embeds on upgrade")
          (is (empty? (jdbc/execute! pgvector [(str "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                                                    " AND tablename LIKE 'library_entity_index%'")]))
              "moved, not copied -- a leftover is a stale duplicate of the whole index"))))))

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
