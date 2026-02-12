(ns metabase-enterprise.metabot-v3.tools.field-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.field-stats :as metabot-v3.tools.field-stats]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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

(defn- table-query
  [metadata-provider table-id]
  (lib/query metadata-provider (lib.metadata/table metadata-provider table-id)))

(defn- query-field-id [query field-id-prefix field-display-name columns-fn]
  (->> (keep-indexed (fn [i col]
                       (when (= (lib/display-name query col) field-display-name)
                         i))
                     (columns-fn query))
       first
       (str field-id-prefix)))

(defn- visible-field-id [query field-id-prefix field-display-name]
  (query-field-id query field-id-prefix field-display-name lib/visible-columns))

(defn- filterable-field-id [query field-id-prefix field-display-name]
  (query-field-id query field-id-prefix field-display-name lib/filterable-columns))

(deftest field-values-table-test
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (let [mp (mt/metadata-provider)
        people-id (mt/id :people)
        people-query (table-query mp people-id)
        birth-date-id (visible-field-id people-query (metabot-v3.tools.u/table-field-id-prefix people-id) "Birth Date")
        state-id (visible-field-id people-query (metabot-v3.tools.u/table-field-id-prefix people-id) "State")
        products-id (mt/id :products)
        products-query (table-query mp products-id)
        category-id (visible-field-id products-query (metabot-v3.tools.u/table-field-id-prefix products-id) "Category")]
    (testing "No read permission results in an error."
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                            (metabot-v3.tools.field-stats/field-values
                             {:entity-type "table", :entity-id people-id, :field-id state-id, :limit 5}))))
    (testing "Getting statistics and values for table fields works."
      (mt/as-admin
        (are [table-id field-id output]
             (= {:structured-output output}
                (metabot-v3.tools.field-stats/field-values
                 {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 5}))
          people-id birth-date-id {:statistics
                                   {:distinct-count 2308
                                    :percent-null   0.0
                                    :earliest       "1958-04-26"
                                    :latest         "2000-04-03"}}
          people-id state-id      {:statistics {:distinct-count 49
                                                :percent-null   0.0
                                                :percent-json   0.0
                                                :percent-url    0.0
                                                :percent-email  0.0
                                                :percent-state  1.0
                                                :average-length 2.0}
                                   :values     ["AK" "AL" "AR" "AZ" "CA"]}
          products-id category-id {:statistics {:distinct-count 4
                                                :percent-null   0.0
                                                :percent-json   0.0
                                                :percent-url    0.0
                                                :percent-email  0.0
                                                :percent-state  0.0
                                                :average-length 6.375}
                                   :values     ["Doohickey" "Gadget" "Gizmo" "Widget"]})))))

(deftest field-values-model-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (ensure-fresh-field-values! (mt/id :people :state))
  (ensure-fresh-field-values! (mt/id :products :category))
  (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query orders)
                                             :type :model}]
    (let [mp (mt/metadata-provider)
          model-query (lib/query mp (lib.metadata/card mp model-id))
          card-field-id-prefix (metabot-v3.tools.u/card-field-id-prefix model-id)
          ;; All fields use c<card-id> syntax with indices from model's visible-columns
          quantity-id (visible-field-id model-query card-field-id-prefix "Quantity")
          state-id (visible-field-id model-query card-field-id-prefix "State")
          category-id (visible-field-id model-query card-field-id-prefix "Category")]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.field-stats/field-values
                               {:entity-type "model", :entity-id model-id, :field-id state-id, :limit 5}))))
      (testing "Getting statistics and values for model fields works."
        (mt/as-admin
          (are [field-id output]
               (=? {:structured-output output}
                   (metabot-v3.tools.field-stats/field-values
                    {:entity-type "model", :entity-id model-id, :field-id field-id, :limit 5}))
            quantity-id {:statistics {:distinct-count 62
                                      :percent-null   0.0}
                         :values     [0 1 2 3 4]}
            state-id    {:statistics {:distinct-count 49
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  1.0
                                      :average-length 2.0}
                         :values     ["AK" "AL" "AR" "AZ" "CA"]}
            category-id {:statistics {:distinct-count 4
                                      :percent-null   0.0
                                      :percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :percent-state  0.0
                                      :average-length 6.375}
                         :values     ["Doohickey" "Gadget" "Gizmo" "Widget"]}))))))

(deftest field-values-metric-test
  (ensure-fresh-field-values! (mt/id :orders :quantity))
  (mt/with-temp [:model/Card {metric-id :id} {:dataset_query (mt/mbql-query orders
                                                               {:aggregation [[:count]]
                                                                :breakout    [$quantity
                                                                              !year.user_id->people.birth_date]})
                                              :type :metric}]
    (let [mp (mt/metadata-provider)
          metric-query (lib/query mp (lib.metadata/metric mp metric-id))
          card-field-id-prefix (metabot-v3.tools.u/card-field-id-prefix metric-id)
          ;; All fields use c<card-id> syntax with indices from metric's filterable-columns
          quantity-id (filterable-field-id metric-query card-field-id-prefix "Quantity")
          birth-date-id (filterable-field-id metric-query card-field-id-prefix "Birth Date")]
      (testing "No read permission results in an error."
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                              (metabot-v3.tools.field-stats/field-values
                               {:entity-type "metric", :entity-id metric-id, :field-id birth-date-id, :limit 5}))))
      (testing "Getting statistics and values for metric fields works."
        (mt/as-admin
          (are [field-id output]
               (=? {:structured-output output}
                   (metabot-v3.tools.field-stats/field-values
                    {:entity-type "metric", :entity-id metric-id, :field-id field-id, :limit 5}))
            quantity-id   {:statistics {:distinct-count 62
                                        :percent-null   0.0}
                           :values     [0 1 2 3 4]}
            birth-date-id {:statistics
                           {:distinct-count 2308
                            :percent-null   0.0
                            :earliest       "1958-04-26"
                            :latest         "2000-04-03"}}))))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
    (let [field-id       (mt/id :categories :name)
          table-id       (mt/id :categories)
          mp             (mt/metadata-provider)
          tq             (table-query mp table-id)
          agent-field-id (visible-field-id tq (metabot-v3.tools.u/table-field-id-prefix table-id) "Name")]
      (try
        (let [result (metabot-v3.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id agent-field-id, :limit 10})]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (get-in result [:structured-output :values])))))
        (finally
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))
