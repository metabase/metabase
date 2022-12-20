(ns metabase.models.params.custom-values-test
  (:require
    [clojure.test :refer :all]
    [metabase.models :refer [Card]]
    [metabase.models.params.custom-values :as custom-values]
    [metabase.test :as mt]
    [toucan.db :as db]))

(defn- find-field-ref
  [id-or-name result-metadata]
  (let [selector (if (string? id-or-name)
                   :name
                   :id)]
    (-> (filter #(= id-or-name (selector %)) result-metadata)
        first
        :field_ref)))

(deftest with-mbql-card-test
  (doseq [dataset? [true false]]
    (testing (format "source card is a %s" (if dataset? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (testing "with simple mbql"
          (mt/with-temp* [Card [{card-id :id, result-metadata :result_metadata}
                                {:database_id     (mt/id)
                                 :dataset         dataset?
                                 :table_id        (mt/id :venues)
                                 :result_metadata (mt/query->expected-cols (mt/mbql-query venues))
                                 :dataset_query   (mt/mbql-query venues)}]]
            (testing "get values"
              (is (=? {:has_more_values true,
                       :values          ["Red Medicine"
                                         "Stout Burgers & Beers"
                                         "The Apple Pan"]}
                      (custom-values/values-from-card
                        card-id
                        (find-field-ref (mt/id :venues :name) result-metadata)))))

            (testing "case in-sensitve search test"
              (is (=? {:has_more_values false
                       :values          ["Liguria Bakery" "Noe Valley Bakery"]}
                      (custom-values/values-from-card
                        card-id
                        (find-field-ref (mt/id :venues :name) result-metadata)
                        "Bakery"))))))

        (testing "has aggregation column"
          (let [query (mt/mbql-query venues {:aggregation [[:sum $venues.price]]
                                             :breakout    [[:field %categories.name {:source-field %venues.category_id}]]})]
            (mt/with-temp* [Card [{card-id :id, result-metadata :result_metadata}
                                  {:database_id     (mt/id)
                                   :table_id        (mt/id :venues)
                                   :dataset         dataset?
                                   :result_metadata (mt/query->expected-cols query)
                                   :dataset_query   query}]]

              (testing "get values from breakout columns"
                (is (=? {:has_more_values true,
                         :values          ["American" "Artisan" "Asian"]}
                        (custom-values/values-from-card
                          card-id
                          (find-field-ref (mt/id :categories :name) result-metadata)))))

              (testing "get values from aggregation column"
                (is (=? {:has_more_values true,
                         :values          [20 4 4]}
                        (custom-values/values-from-card
                          card-id
                          (find-field-ref "sum" result-metadata)))))

              (testing "doing case in-sensitve search on breakout columns"
                (is (=? {:has_more_values false
                         :values          ["Bakery"]}
                        (custom-values/values-from-card
                          card-id
                          (find-field-ref (mt/id :categories :name) result-metadata)
                          "Bakery")))))))))))

(deftest with-native-card-test
  (doseq [dataset? [true false]]
    (testing (format "source card is a %s with native question" (if dataset? "model" "question"))
      (binding [custom-values/*max-rows* 3]
        (let [query (mt/native-query {:query "select * from venues where lower(name) like '%red%'"})]
          (mt/with-temp* [Card [{card-id :id}
                                {:database_id   (mt/id)
                                 :dataset       dataset?
                                 :table_id      (mt/id :venues)
                                 :dataset_query query}]]
            ;; HACK: run the card so the card's result_metadata is available
            (mt/user-http-request :crowberto :post 202 (format "card/%s/query" card-id))
            (let [result-metadata (db/select-one-field :result_metadata Card :id card-id)]
              (testing "get values from breakout columns"
                (is (=? {:has_more_values false,
                         :values          ["Red Medicine" "Fred 62"]}
                        (custom-values/values-from-card
                          card-id
                          (find-field-ref "NAME" result-metadata)))))

              (testing "doing case in-sensitve search on breakout columns"
                (is (=? {:has_more_values false
                         :values          ["Red Medicine"]}
                        (custom-values/values-from-card
                          card-id
                          (find-field-ref "NAME" result-metadata)
                          "medicine")))))))))))
