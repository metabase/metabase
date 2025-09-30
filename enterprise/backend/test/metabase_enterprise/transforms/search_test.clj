(ns metabase-enterprise.transforms.search-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

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
    (testing "A simple transform gets properly ingested & indexed for search"
      (let [transform-name (mt/random-name)
            now            (t/truncate-to (t/offset-date-time) :millis)]
        (mt/with-temp [:model/Transform {transform-id :id} {:name        transform-name
                                                            :description "A test transform"
                                                            :source      {:type "query"
                                                                          :query {:database (mt/id)
                                                                                  :native {:query "SELECT 1"}}}
                                                            :target      {:database (mt/id)
                                                                          :table "test_table"}
                                                            :created_at  now
                                                            :updated_at  now}]
          (is (=? (index-entity
                   {:model            "transform"
                    :model_id         (str transform-id)
                    :name             transform-name
                    :database_id      (mt/id)
                    :model_created_at now
                    :model_updated_at now})
                  (ingest-then-fetch! "transform" transform-name))))))))
