(ns metabase.query-processor.middleware.resolve-referenced-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.middleware.resolve-referenced :as referenced]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(deftest tags-referenced-cards-lookup-test
  (testing "returns Card instances from raw query"
    (tt/with-temp* [Card [c1 {}]
                    Card [c2 {}]]
      (is (= [c1 c2]
             (#'referenced/tags-referenced-cards
              {:native
               {:template-tags
                {"tag-name-not-important1" {:type :card
                                            :card (:id c1)}
                 "tag-name-not-important2" {:type :card
                                            :card (:id c2)}}}}))))))

(deftest resolve-card-resources-test
  (testing "resolve stores source table from referenced card"
    (tt/with-temp Card [mbql-card {:dataset_query (data/mbql-query venues
                                                    {:filter [:< [:field-id $price] 3]})}]
      (let [query {:native
                   {:template-tags
                    {"tag-name-not-important1" {:type :card
                                                :card (:id mbql-card)}}}}]
        (qp.store/with-store
          (qp.store/fetch-and-store-database! (data/id))

          (is (thrown-with-msg? Exception #"Error: Table [0-9]+ is not present in the Query Processor Store\."
                                (qp.store/table (data/id :venues))))
          (is (thrown-with-msg? Exception #"Error: Field [0-9]+ is not present in the Query Processor Store\."
                                (qp.store/field (data/id :venues :price))))

          (#'referenced/resolve-referenced-card-resources* query)

          (is (some? (qp.store/table (data/id :venues))))
          (is (some? (qp.store/field (data/id :venues :price)))))))))
