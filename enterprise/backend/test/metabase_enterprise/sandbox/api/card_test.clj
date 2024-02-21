(ns metabase-enterprise.sandbox.api.card-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.card-test :as api.card-test]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest parameters-with-source-is-card-test
  (testing "a card with a parameter whose source is a card should respect sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (mt/with-temp
          [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                             :table_id      (mt/id :categories)
                                             :dataset_query (mt/mbql-query categories)}
           :model/Card {card-id         :id} {:database_id     (mt/id)
                                              :dataset_query   (mt/mbql-query categories)
                                              :parameters      [{:id                   "abc"
                                                                 :type                 "category"
                                                                 :name                 "CATEGORY"
                                                                 :values_source_type   "card"
                                                                 :values_source_config {:card_id     source-card-id
                                                                                        :value_field (mt/$ids $categories.name)}}]
                                              :table_id        (mt/id :venues)}]

        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc")))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                     :has_more_values false}
                    (get-values :rasta)))))

        (testing "when searching values"
          ;; return BBQ if not sandboxed
          (let [search (fn [user]
                         (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc" "bbq")))]
            (is (=? {:values          [["BBQ"]]
                     :has_more_values false}
                    (search :crowberto)))

            (is (=? {:values          []
                     :has_more_values false}
                    (search :rasta)))))))))

(deftest is-sandboxed-test
  (testing "Adding a GTAP to the all users group to a table makes it such that is_sandboxed returns true."
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (t2.with-temp/with-temp [:model/Card card {:database_id   (mt/id)
                                                 :table_id      (mt/id :categories)
                                                 :dataset_query (mt/mbql-query categories)}]
        (is (get-in (qp/process-query (qp/userland-query (:dataset_query card))) [:data :is_sandboxed]))))))
