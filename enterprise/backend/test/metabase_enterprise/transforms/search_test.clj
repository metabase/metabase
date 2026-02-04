(ns metabase-enterprise.transforms.search-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.search-test :as search-test])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(deftest transform-ingestion-test
  (search.tu/with-temp-index-table
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
          (let [ingested-transform (search-test/ingest-then-fetch! "transform" "Test Python transform")]
            (is (=? (search-test/index-entity
                     {:model            "transform"
                      :model_id         (str transform-id)
                      :name             "Test Python transform"
                      :database_id      (mt/id)
                      :model_created_at now
                      :model_updated_at now})
                    ingested-transform))))))))

(deftest transform-query-ingestion-test
  (testing "Contents of Python transform sources are extracted and indexed for full-text search"
    (when (= (mdb/db-type) :postgres)
      (mt/with-temp [:model/Transform _ {:target {:database (mt/id)}
                                         :source {:type "python"
                                                  :source-database (mt/id)
                                                  :body "import pandas as pd\n"}
                                         :name "Test python transform"}]
        (let [ingested-transform (search-test/ingest-then-fetch! "transform" "Test python transform")
              vector-value (.getValue ^PGobject (:with_native_query_vector ingested-transform))]
          (is (string? vector-value))
          (is (re-find #"import" vector-value))
          (is (re-find #"panda" vector-value)))))))
