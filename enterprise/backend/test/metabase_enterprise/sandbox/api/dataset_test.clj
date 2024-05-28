(ns metabase-enterprise.sandbox.api.dataset-test
  (:require
    [clojure.test :refer :all]
    [metabase-enterprise.test :as met]
    [metabase.models :refer [Card]]
    [metabase.test :as mt]))

(deftest dataset-parameter-test
  (testing "POST /api/dataset/parameter/values should follow sandbox rules"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (testing "with values_source_type=card"
        (mt/with-temp
          [Card {source-card-id :id} {:database_id   (mt/id)
                                      :table_id      (mt/id :categories)
                                      :dataset_query (mt/mbql-query categories)}]

          (testing "when getting values"
            (let [get-values (fn [user]
                               (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                 {:parameter {:id                   "abc"
                                              :type                 "category"
                                              :name                 "CATEGORY"
                                              :values_source_type   "card"
                                              :values_source_config {:card_id     source-card-id
                                                                     :value_field (mt/$ids $categories.name)}}}))]

              ;; returns much more if not sandboxed
              (is (> (-> (get-values :crowberto) :values count) 3))
              (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                       :has_more_values false}
                      (get-values :rasta)))))

          (testing "when searching values"
            (let [search (fn [user]
                           (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                                 {:parameter {:id                   "abc"
                                                              :type                 "category"
                                                              :name                 "CATEGORY"
                                                              :values_source_type   "card"
                                                              :values_source_config {:card_id     source-card-id
                                                                                     :value_field (mt/$ids $categories.name)}}}))]

              ;; returns `BBQ` if not sandboxed
              (is (=? {:values          [["BBQ"]]
                       :has_more_values false}
                      (search :crowberto)))

              (is (=? {:values          []
                        :has_more_values false}
                      (search :rasta)))))))

      (testing "values_source_type=nil (values from fields)"
        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                   {:parameter {:id                 "abc"
                                                                :type               "category"
                                                                :name               "CATEGORY"
                                                                :values_source_type nil}
                                                    :field_ids [(mt/id :categories :name)]}))]

            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["Artisan"] ["African"] ["American"]]
                     :has_more_values false}
                    (get-values :rasta)))))

        (testing "when searching values"
          (let [search (fn [user]
                         (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                               {:parameter {:id                 "abc"
                                                            :type               "category"
                                                            :name               "CATEGORY"
                                                            :values_source_type nil}
                                                :field_ids [(mt/id :categories :name)]}))]

            ;; returns `BBQ` if not sandboxed
            (is (=? {:values [["BBQ"]]}
                    (search :crowberto)))

            (is (=? {:values          []}
                    (search :rasta)))))))))
