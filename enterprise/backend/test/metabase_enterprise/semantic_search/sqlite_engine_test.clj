(ns metabase-enterprise.semantic-search.sqlite-engine-test
  "The SQLite store wired in as the semantic search engine (PLAN_002)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- sqlite-test-extension-available? []
  (try
    (sqlite/extension-path)
    true
    (catch Exception _
      false)))

(deftest gating-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-dynamic-fn-redefs [semantic.embedding/embedding-supported? (constantly true)]
      (testing "SQLite mode: semantic is supported without pgvector, and every pgvector gate is off"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly "/tmp/unused-sqlite-store.db")]
          (is (search.engine/supported-engine? :search.engine/semantic))
          (is (= :search.engine/semantic (first (search.engine/supported-engines))))
          (is (false? (semantic.util/semantic-search-configured?)))
          (is (false? (semantic.util/semantic-search-available?)))))
      (testing "without the store, support still depends on pgvector as before"
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path (constantly nil)]
          (is (= (semantic.util/semantic-search-available?)
                 (search.engine/supported-engine? :search.engine/semantic))))))))

;;; ------------------------------------------------- Write hooks --------------------------------------------------

(def ^:private test-model
  {:provider "test" :model-name "test-model" :vector-dimensions 4 :embedding-space-id "test-space-4"})

(defn- doc [model id text]
  {:model model :id id :name (str model " " id) :embeddable_text text :archived false
   :legacy_input {:id id :model model}})

(defn- temp-db-path []
  (str (java.nio.file.Files/createTempDirectory "vec1-engine" (make-array java.nio.file.attribute.FileAttribute 0))
       "/store.db"))

(defn- do-with-sqlite-engine!
  "Run `f` with the semantic engine in SQLite mode on a fresh temp store: stubbed embeddings (every text -> the same
  vector), synchronous background indexing, no personal-collection lookups."
  [f]
  (let [path       (temp-db-path)
        index-all! sqlite/index-all!]
    (try
      (mt/with-premium-features #{:semantic-search}
        (mt/with-dynamic-fn-redefs [sqlite-config/db-path                           (constantly path)
                                    semantic.embedding/get-configured-model         (constantly test-model)
                                    semantic.embedding/embedding-supported?         (constantly true)
                                    semantic.index/batch-resolve-personal-owner-ids (constantly {})
                                    semantic.embedding/process-embeddings-streaming (fn [_model texts process-fn & _]
                                                                                      (process-fn (zipmap texts (repeat [1 0 0 0]))))
                                    sqlite/index-all-async!                         (fn [documents & {:as opts}]
                                                                                      (index-all! documents opts))]
          (f)))
      (finally
        (sqlite/delete-store! path)))))

(defn- stored-keys []
  (set (map (juxt :model :model_id) (:rows (sqlite/search-text "anything" :k 100 :record-tokens? false)))))

(deftest write-hooks-test
  (when (sqlite-test-extension-available?)
    (do-with-sqlite-engine!
     (fn []
       (mt/with-dynamic-fn-redefs [semantic.embedding/get-embedding (constantly [1 0 0 0])]
         (testing "init! creates the store and indexes the documents"
           (is (nil? (semantic.core/init! [(doc "card" 1 "a") (doc "card" 2 "b") (doc "dashboard" 1 "c")] {})))
           (is (=? {:schema :created :docs 3 :vectors 3} (sqlite/stats))))
         (testing "update-index! upserts and returns {model count}"
           (is (= {"card" 2 "metric" 1}
                  (semantic.core/update-index! [(doc "card" 2 "b2") (doc "card" 3 "d") (doc "metric" 1 "e")])))
           (is (= "b2" (:content (sqlite/get-doc "card" 2)))))
         (testing "delete-from-index! deletes and returns {model count}"
           (is (= {"card" 1} (semantic.core/delete-from-index! "card" [3 404])))
           (is (nil? (sqlite/get-doc "card" 3))))
         (testing "diagnose reports presence"
           (is (= :candidate (:type (semantic.core/diagnose {} "card" 1))))
           (is (= :missing-from-index (:type (semantic.core/diagnose {} "card" 3)))))
         (testing "init! again prunes documents that are no longer searchable"
           (semantic.core/init! [(doc "card" 1 "a") (doc "dashboard" 1 "c")] {})
           (is (= #{["card" "1"] ["dashboard" "1"]} (stored-keys))))
         (testing "repair-index! re-indexes and prunes"
           (is (=? {:index-id 0 :orphans 1} (semantic.core/repair-index! [(doc "card" 1 "a")])))
           (is (= #{["card" "1"]} (stored-keys))))
         (testing "init! with :force-reset? starts from an empty store"
           (sqlite/upsert-documents! [(doc "card" 9 "z")])
           (semantic.core/init! [(doc "dashboard" 5 "q")] {:force-reset? true})
           (is (=? {:schema :created} (sqlite/stats)))
           (is (= #{["dashboard" "5"]} (stored-keys)))))))))
