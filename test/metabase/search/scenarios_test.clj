(ns metabase.search.scenarios-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config :as config]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(defn ingest!
  "Ingest any objects with name contains `search-term`"
  [search-term]
  (doseq [model (keys (methods search.spec/spec))]
    (-> (#'search.ingestion/spec-index-reducible model [:like :this.name (str "%" search-term "%")])
        (#'search.ingestion/query->documents)
        search.ingestion/consume!)))

(defn fulltext-search
  [search-string]
  (map (juxt :model :id :name) (search.tu/search-results search-string {:search-engine "fulltext"})))

(deftest e2e-accounts-test
  ;; https://metaboat.slack.com/archives/C072YM78NGK/p1731616354121189
  (when config/ee-available?
    (mt/with-premium-features #{:official-collections}
      (search.tu/with-temp-index-table
        (let [search-term* (mt/random-name)
              search-term  #(str search-term* " " %)]
          (mt/with-temp
            [:model/Database   {db-id :id}             {:name "Test Database"}
             :model/Table      {table-id :id}          {:name       (search-term "table")
                                                        :view_count 40
                                                        :db_id      db-id}
             :model/Card       {card-id :id}           {:name       (search-term "card")
                                                        :view_count 41}
             :model/Card       {model-id :id}          {:name       (search-term "model")
                                                        :type       :model
                                                        :view_count 42}
             :model/Collection {official-col-id :id}   {:name            "Official Collection"
                                                        :authority_level "official"}
             :model/Card       {official-card-id :id}  {:name          (search-term "Card Official")
                                                        :collection_id official-col-id
                                                        :view_count    41}
             :model/Card       {official-model-id :id} {:name          (search-term "Model Official")
                                                        :type          :model
                                                        :collection_id official-col-id
                                                        :view_count    42}]
            (ingest! search-term*)
            (testing "official items are preferred, models > card even though card has slightly higher view count"
              (is (= [["dataset"  official-model-id (search-term "Model Official")]
                      ["card"     official-card-id  (search-term "Card Official")]
                      ["dataset"  model-id          (search-term "model")]
                      ["card"     card-id           (search-term "card")]
                      ["table"    table-id          (search-term "table")]]
                     (fulltext-search search-term*))))))))))
