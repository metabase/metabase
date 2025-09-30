(ns metabase-enterprise.transforms.search-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- ingest!
  [model where-clause]
  (#'search.engine/update!
   :search.engine/appdb
   (#'search.ingestion/query->documents
    (#'search.ingestion/spec-index-reducible model where-clause))))

(defn- fetch-one [model & clauses]
  (apply t2/select-one (search.index/active-table) :model model clauses))

(defn- ingest-then-fetch!
  [model entity-name]
  (ingest! model [:= :this.name entity-name])
  (fetch-one model :name entity-name))

(def ^:private default-index-entity
  {:model               nil
   :model_id            nil
   :name                nil
   :official_collection nil
   :database_id         nil
   :pinned              nil
   :view_count          nil
   :collection_id       nil
   :last_viewed_at      nil
   :model_created_at    nil
   :model_updated_at    nil
   :dashboardcard_count nil
   :last_edited_at      nil
   :last_editor_id      nil
   :verified            nil})

(defn- index-entity
  [entity]
  (merge default-index-entity entity))

(deftest transform-ingestion-test
  (search.tu/with-temp-index-table
    (testing "A simple SQL transform gets properly ingested & indexed for search"
      (let [now (t/truncate-to (t/offset-date-time) :millis)]
        (mt/with-temp [:model/Transform {transform-id :id} {:name        "Test transform"
                                                            :description "A test transform"
                                                            :source      {:type "query"
                                                                          :query {:database (mt/id)
                                                                                  :native {:query "SELECT 1"}}}
                                                            :target      {:database (mt/id)
                                                                          :table "test_table"}
                                                            :created_at  now
                                                            :updated_at  now}]
          (let [ingested-transform (ingest-then-fetch! "transform" "Test transform")]
            (is (=? (index-entity
                     {:model            "transform"
                      :model_id         (str transform-id)
                      :name             "Test transform"
                      :database_id      (mt/id)
                      :model_created_at now
                      :model_updated_at now})
                    ingested-transform))))))

    (testing "A simple Python transform gets properly ingested & indexed for search"
      (let [now (t/truncate-to (t/offset-date-time) :millis)]
        (mt/with-temp [:model/Transform {transform-id :id} {:name        "Test Python transform"
                                                            :description "A Python test transform"
                                                            :source      {:type "python"
                                                                          :source-database (mt/id)
                                                                          :body "import pandas as pd\n"}
                                                            :target      {:database (mt/id)}
                                                            :created_at  now
                                                            :updated_at  now}]
          (let [ingested-transform (ingest-then-fetch! "transform" "Test Python transform")]
            (is (=? (index-entity
                     {:model            "transform"
                      :model_id         (str transform-id)
                      :name             "Test Python transform"
                      :database_id      (mt/id)
                      :model_created_at now
                      :model_updated_at now})
                    ingested-transform))))))

    (testing "A simple MBQL transform gets properly ingested & indexed for search"
      (let [now (t/truncate-to (t/offset-date-time) :millis)]
        (mt/with-temp [:model/Transform {transform-id :id} {:name        "Test MBQL transform"
                                                            :description "An MBQL test transform"
                                                            :source      {:type "query"
                                                                          :query (mt/mbql-query venues {:limit 10})}
                                                            :target      {:database (mt/id)
                                                                          :table "test_mbql_table"}
                                                            :created_at  now
                                                            :updated_at  now}]
          (let [ingested-transform (ingest-then-fetch! "transform" "Test MBQL transform")]
            (is (=? (index-entity
                     {:model            "transform"
                      :model_id         (str transform-id)
                      :name             "Test MBQL transform"
                      :database_id      (mt/id)
                      :model_created_at now
                      :model_updated_at now})
                    ingested-transform))))))))

(deftest transform-query-ingestion-test
  (testing "Contents of SQL and Python transform sources are extracted and indexed for full-text search"
    (when (= (mdb/db-type) :postgres)
      (mt/with-temp [:model/Transform _ {:target {:database (mt/id)
                                                  :table "test_table"}
                                         :name "Test SQL transform"
                                         :source {:type "query"
                                                  :query {:database (mt/id)
                                                          :native {:query "SELECT 1"}}}}]

        (let [ingested-transform (ingest-then-fetch! "transform" "Test SQL transform")]
          (is (= "'1':8B 'select':7B 'sql':2A,5B 'test':1A,4B 'transform':3A,6B"
                 (.getValue ^PGobject (:with_native_query_vector ingested-transform))))))

      (mt/with-temp [:model/Transform _ {:target {:database (mt/id)}
                                         :source {:type "python"
                                                  :source-database (mt/id)
                                                  :body "import pandas as pd\n"}
                                         :name "Test python transform"}]
        (let [ingested-transform (ingest-then-fetch! "transform" "Test python transform")]
          (is (= "'import':7B 'panda':8B 'pd':10B 'python':2A,5B 'test':1A,4B 'transform':3A,6B"
                 (.getValue ^PGobject (:with_native_query_vector ingested-transform))))))

      (testing "MBQL queries are not indexed in with_native_query_vector"
        (mt/with-temp [:model/Transform _ {:target {:database (mt/id)
                                                    :table "test_mbql_table"}
                                           :name "Test MBQL transform"
                                           :source {:type "query"
                                                    :query (mt/mbql-query venues {:limit 10})}}]
          (let [ingested-transform (ingest-then-fetch! "transform" "Test MBQL transform")]
            (is (= "'mbql':2A,5B 'test':1A,4B 'transform':3A,6B"
                   (.getValue ^PGobject (:with_native_query_vector ingested-transform))))))))))
