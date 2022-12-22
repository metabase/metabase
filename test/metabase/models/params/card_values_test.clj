(ns metabase.models.params.card-values-test
  (:require
    [clojure.test :refer :all]
    [metabase.models :refer [Card]]
    [metabase.models.params.card-values :as params.card-values]
    [metabase.test :as mt]))

(deftest with-mbql-card-test
  (doseq [dataset? [true false]]
    (testing (format "source card is a %s" (if dataset? "model" "question"))
      (binding [params.card-values/*max-rows* 3]
        (testing "with simple mbql"
          (mt/with-temp* [Card [{card-id :id}
                                (merge (mt/card-with-source-metadata-for-query (mt/mbql-query venues))
                                       {:database_id     (mt/id)
                                        :dataset         dataset?
                                        :table_id        (mt/id :venues)})]]
            (testing "get values"
              (is (=? {:has_more_values true,
                       :values          ["Red Medicine"
                                         "Stout Burgers & Beers"
                                         "The Apple Pan"]}
                      (params.card-values/values-from-card
                        card-id
                        (mt/$ids $venues.name)))))

            (testing "case in-sensitve search test"
              (is (=? {:has_more_values false
                       :values          ["Liguria Bakery" "Noe Valley Bakery"]}
                      (params.card-values/values-from-card
                        card-id
                        (mt/$ids $venues.name)
                        "bakery"))))))

        (testing "has aggregation column"
          (mt/with-temp* [Card [{card-id :id}
                                (merge (mt/card-with-source-metadata-for-query
                                         (mt/mbql-query venues
                                                        {:aggregation [[:sum $venues.price]]
                                                         :breakout    [[:field %categories.name {:source-field %venues.category_id}]]}))
                                       {:database_id     (mt/id)
                                        :dataset         dataset?
                                        :table_id        (mt/id :venues)})]]

            (testing "get values from breakout columns"
              (is (=? {:has_more_values true,
                       :values          ["American" "Artisan" "Asian"]}
                      (params.card-values/values-from-card
                        card-id
                        (mt/$ids $categories.name)))))

            (testing "get values from aggregation column"
              (is (=? {:has_more_values true,
                       :values          [20 4 4]}
                      (params.card-values/values-from-card
                        card-id
                        [:field "sum" {:base-type :type/Float}]))))

            (testing "doing case in-sensitve search on breakout columns"
              (is (=? {:has_more_values false
                       :values          ["Bakery"]}
                      (params.card-values/values-from-card
                        card-id
                        (mt/$ids $categories.name)
                        "bakery"))))))))))

(deftest with-native-card-test
  (doseq [dataset? [true false]]
    (testing (format "source card is a %s with native question" (if dataset? "model" "question"))
      (binding [params.card-values/*max-rows* 3]
        (mt/with-temp* [Card [{card-id :id}
                              (merge (mt/card-with-source-metadata-for-query
                                       (mt/native-query {:query "select * from venues where lower(name) like '%red%'"}))
                                     {:database_id     (mt/id)
                                      :dataset         dataset?
                                      :table_id        (mt/id :venues)})]]
          ;; HACK: run the card so the card's result_metadata is available
          (testing "get values from breakout columns"
            (is (=? {:has_more_values false,
                     :values          ["Red Medicine" "Fred 62"]}
                    (params.card-values/values-from-card
                      card-id
                      [:field "NAME" {:base-type :type/Float}]))))

          (testing "doing case in-sensitve search on breakout columns"
            (is (=? {:has_more_values false
                     :values          ["Red Medicine"]}
                    (params.card-values/values-from-card
                      card-id
                      [:field "NAME" {:base-type :type/Float}]
                      "medicine")))))))))
