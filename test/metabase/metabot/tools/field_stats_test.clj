(ns metabase.metabot.tools.field-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.field-stats :as metabot.tools.field-stats]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn- ensure-fresh-field-values!
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id :type :full)
  (is (= :full (-> (t2/select-one :model/Field :id field-id)
                   field-values/get-or-create-full-field-values!
                   :type)))
  (is (= 1 (t2/count :model/FieldValues :field_id field-id :type :full))))

(deftest field-values-table-test
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (let [birth-date-id (mt/id :people :birth_date)
        state-id      (mt/id :people :state)
        people-id     (mt/id :people)
        products-id   (mt/id :products)
        category-id   (mt/id :products :category)]
    (testing "No read permission results in an error."
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot.tools.field-stats/field-values
                             {:entity-type "table", :entity-id people-id, :field-id state-id, :limit 5}))))
    (testing "Getting statistics and values for table fields works."
      (mt/as-admin
        ;; Skewness is a derived double whose last few digits vary across JVMs/platforms,
        ;; so strip it from the exact-equality check and assert approximate value separately.
        (let [birth-date-result (metabot.tools.field-stats/field-values
                                 {:entity-type "table", :entity-id people-id, :field-id birth-date-id, :limit 5})
              birth-date-skewness (get-in birth-date-result
                                          [:structured-output :value_metadata :statistics :skewness])]
          (is (some? birth-date-skewness))
          (is (< (abs (- birth-date-skewness -0.00557870227770)) 1e-6)
              "skewness should be approximately -0.00557870227770"))
        (are [table-id field-id value-metadata]
             (= {:structured-output {:result-type    :field-metadata
                                     :field_id       field-id
                                     :value_metadata value-metadata}}
                (let [result (metabot.tools.field-stats/field-values
                              {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 5})]
                  ;; strip skewness to avoid platform-dependent floating-point mismatch
                  (cond-> result
                    (get-in result [:structured-output :value_metadata :statistics :skewness])
                    (update-in [:structured-output :value_metadata :statistics] dissoc :skewness))))
          people-id   birth-date-id {:statistics
                                     {:distinct-count      2308
                                      :percent-null        0.0
                                      :earliest            "1958-04-26"
                                      :latest              "2000-04-03"
                                      :hour-distribution   nil
                                      :mode-fraction       0.0012
                                      :top-3-fraction      0.0032
                                      :weekday-distribution [0.15 0.1304 0.1416 0.1372 0.156 0.1516 0.1332]}}
          people-id   state-id      {:statistics   {:distinct-count 49
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  1.0
                                                    :average-length 2.0
                                                    :max-length     2.0
                                                    :min-length     2.0
                                                    :mode-fraction  0.0776
                                                    :top-3-fraction 0.1624
                                                    :percent-blank  0.0}
                                     :field_values ["AK" "AL" "AR" "AZ" "CA"]}
          products-id category-id   {:statistics   {:distinct-count 4
                                                    :percent-null   0.0
                                                    :percent-json   0.0
                                                    :percent-url    0.0
                                                    :percent-email  0.0
                                                    :percent-state  0.0
                                                    :average-length 6.375
                                                    :max-length     9.0
                                                    :min-length     5.0
                                                    :mode-fraction  0.27
                                                    :top-3-fraction 0.79
                                                    :percent-blank  0.0}
                                     :field_values ["Doohickey" "Gadget" "Gizmo" "Widget"]})))))

(deftest field-values-model-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders)
                                             :type :model}]
    (let [quantity-id (mt/id :orders :quantity)
          state-id    (mt/id :people :state)
          category-id (mt/id :products :category)]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot.tools.field-stats/field-values
                               {:entity-type "model", :entity-id model-id, :field-id state-id, :limit 5}))))
      (testing "Getting statistics and values for model fields works."
        (mt/as-admin
          (are [field-id value-metadata]
               (=? {:structured-output {:field_id field-id
                                        :value_metadata value-metadata}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "model", :entity-id model-id, :field-id field-id, :limit 5}))
            quantity-id {:statistics {:distinct-count 62
                                      :percent-null   0.0}
                         :field_values [0 1 2 3 4]}
            state-id    {:statistics {:distinct-count 49
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  1.0
                                      :average-length 2.0}
                         :field_values ["AK" "AL" "AR" "AZ" "CA"]}
            category-id {:statistics {:distinct-count 4
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  0.0
                                      :average-length 6.375}
                         :field_values ["Doohickey" "Gadget" "Gizmo" "Widget"]}))))))

(deftest field-values-metric-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (mt/with-temp [:model/Card {metric-id :id} {:dataset_query (mt/mbql-query orders
                                                               {:aggregation [[:count]]
                                                                :breakout    [$quantity
                                                                              !year.user_id->people.birth_date]})
                                              :type :metric}]
    (let [quantity-id   (mt/id :orders :quantity)
          birth-date-id (mt/id :people :birth_date)]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot.tools.field-stats/field-values
                               {:entity-type "metric", :entity-id metric-id, :field-id birth-date-id, :limit 5}))))
      (testing "Getting statistics and values for metric fields works."
        (mt/as-admin
          (are [field-id value-metadata]
               (=? {:structured-output {:field_id field-id
                                        :value_metadata value-metadata}}
                   (metabot.tools.field-stats/field-values
                    {:entity-type "metric", :entity-id metric-id, :field-id field-id, :limit 5}))
            quantity-id   {:statistics {:distinct-count 62
                                        :percent-null   0.0}
                           :field_values [0 1 2 3 4]}
            birth-date-id {:statistics
                           {:distinct-count 2308
                            :percent-null   0.0
                            :earliest       "1958-04-26"
                            :latest         "2000-04-03"}}))))))
