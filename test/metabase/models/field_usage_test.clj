(ns metabase.models.field-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def field-usage-keys [:card_id :field_id :column_name :table_name :is_current])

(defn- field-usages-for-card
  [card-id]
  (t2/select-fn-set #(select-keys % field-usage-keys) :model/FieldUsage
                    :card_id card-id))

(defn- do-with-test-setup [f]
  (let [table-id (mt/id :orders)
        tax-id   (t2/select-one-pk :model/Field :table_id table-id :name "TAX")
        total-id (t2/select-one-pk :model/Field :table_id table-id :name "TOTAL")]
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query {:query "SELECT NOT_TAX, TOTAL FROM orders"}}]
      (try
       (f {:table-id table-id :tax-id tax-id :total-id total-id :card-id card-id})
       (finally
         (t2/delete! :model/FieldUsage :card_id card-id))))))

(defmacro ^:private with-test-setup
  [& body]
  `(do-with-test-setup (fn [{:keys [~'table-id ~'tax-id ~'total-id ~'card-id]}]
                         ~@body)))

(defn- trigger-parse!
  [card-id]
  (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query "SELECT TAX, TOTAL FROM orders"})}))

(deftest field-usages-created-by-queries-test
  (with-test-setup
    (is (empty? (t2/select :model/FieldUsage :card_id card-id)))
    (testing "Updating a query ensure we have corresponding FieldUsages for it"
      (let [default-field-usage {:card_id    card-id
                                 :table_name "ORDERS"
                                 :is_current true}]
        (trigger-parse! card-id)
        (is (= #{(merge default-field-usage {:field_id    tax-id
                                             :column_name "TAX"})
                 (merge default-field-usage {:field_id    total-id
                                             :column_name "TOTAL"})}
               (field-usages-for-card card-id)))))))

(deftest bogus-queries-test
  (with-test-setup
    (testing "Updating a query with bogus columns does not create FieldUsages"
      (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query "SELECT DOES, NOT_EXIST FROM orders"})})
      (is (empty? (t2/select :model/FieldUsage :card_id card-id))))))

(deftest field-deactivation-test
  (with-test-setup
    (testing "deactivating a field twiddles field_usage.is_current"
      (trigger-parse! card-id)
      (t2/update! :model/Field tax-id {:active false})
      (is (= #{{:field_id tax-id   :is_current false}
               {:field_id total-id :is_current true}}
             (t2/select-fn-set #(select-keys % [:field_id :is_current]) :model/FieldUsage :card_id card-id))))))
