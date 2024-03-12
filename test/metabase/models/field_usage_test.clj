(ns metabase.models.field-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def field-usage-keys [:card_id :field_id :column_name :table_name :is_currently_valid])

(defn- field-usages-for-card
  [card-id]
  (t2/select-fn-set #(select-keys % field-usage-keys) :model/FieldUsage
                    :card_id card-id))

(defn- do-with-test-setup [f]
  (binding [query-analyzer/*parse-queries-in-test?* true]
    (let [table-id (mt/id :orders)
          tax-id   (t2/select-one-pk :model/Field :table_id table-id :name "TAX")
          total-id (t2/select-one-pk :model/Field :table_id table-id :name "TOTAL")]
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query (mt/native-query {:query "SELECT NOT_TAX, TOTAL FROM orders"})}]
        (try
          (f {:table-id table-id :tax-id tax-id :total-id total-id :card-id card-id})
          (finally
            (t2/delete! :model/FieldUsage :card_id card-id)))))))

(defmacro ^:private with-test-setup
  "Creates a new card that queries one column that exists (TOTAL) and one that does not (NOT_TAX). Anaphorically
  provides `card-id`, `table-id`, `tax-id`, and `total-id`."
  [& body]
  `(do-with-test-setup (fn [{:keys [~'table-id ~'tax-id ~'total-id ~'card-id]}]
                         ~@body)))

(defn- trigger-parse!
  "Update the card to query two columns that do exist: TAX and TOTAL"
  [card-id]
  (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query "SELECT TAX, TOTAL FROM orders"})}))

(deftest field-usages-created-by-queries-test
  (with-test-setup
    (let [default-field-usage {:card_id            card-id
                               :table_name         "ORDERS"
                               :is_currently_valid true}
          total-fu            (merge default-field-usage
                                     {:field_id    total-id
                                      :column_name "TOTAL"})]
      (testing "A freshly created card has relevant corresponding FieldUsages"
        (is (= #{total-fu}
               (field-usages-for-card card-id))))

      (testing "Updating a query keeps the FieldUsages in sync"
        (trigger-parse! card-id)
        (is (= #{(merge default-field-usage {:field_id    tax-id
                                             :column_name "TAX"})
                 total-fu}
               (field-usages-for-card card-id)))))))

(deftest bogus-queries-test
  (with-test-setup
    (testing "Updating a query with bogus columns does not create FieldUsages"
      (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query "SELECT DOES, NOT_EXIST FROM orders"})})
      (is (empty? (t2/select :model/FieldUsage :card_id card-id))))))

(deftest field-deactivation-test
  (with-test-setup
    (testing "deactivating a field twiddles field_usage.is_currently_valid"
      (try
        (trigger-parse! card-id)
        (t2/update! :model/Field tax-id {:active false})
        (is (= #{{:field_id tax-id   :is_currently_valid false}
                 {:field_id total-id :is_currently_valid true}}
               (t2/select-fn-set #(select-keys % [:field_id :is_currently_valid]) :model/FieldUsage :card_id card-id)))
        (finally
          (t2/update! :model/Field tax-id {:active true}))))))
