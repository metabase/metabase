(ns metabase.models.query-field-test
  (:require
   [clojure.test :refer :all]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private query-field-keys [:card_id :field_id])

(defn- query-fields-for-card
  [card-id]
  (t2/select-fn-set #(select-keys % query-field-keys) :model/QueryField
                    :card_id card-id))

(defn- do-with-test-setup [f]
  (binding [query-analyzer/*parse-queries-in-test?* true]
    (let [table-id (mt/id :orders)
          tax-id   (t2/select-one-pk :model/Field :table_id table-id :name "TAX")
          total-id (t2/select-one-pk :model/Field :table_id table-id :name "TOTAL")]
      (t2.with-temp/with-temp [:model/Card {card-id :id}
                               {:dataset_query (mt/native-query {:query "SELECT NOT_TAX, TOTAL FROM orders"})}]
        (try
          (f {:card-id  card-id
              :tax-id   tax-id
              :total-id total-id
              :table-id table-id})
          (finally
            (t2/delete! :model/QueryField :card_id card-id)))))))

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

(deftest query-fields-created-by-queries-test
  (with-test-setup
    (let [total-qf {:card_id  card-id
                    :field_id total-id}
          tax-qf   {:card_id  card-id
                    :field_id tax-id}]
      (testing "A freshly created card has relevant corresponding QueryFields"
        (is (= #{total-qf}
               (query-fields-for-card card-id))))

      (testing "Updating a query keeps the QueryFields in sync"
        (trigger-parse! card-id)
        (is (= #{tax-qf total-qf}
               (query-fields-for-card card-id)))))))

(deftest bogus-queries-test
  (with-test-setup
    (testing "Updating a query with bogus columns does not create QueryFields"
      (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query "SELECT DOES, NOT_EXIST FROM orders"})})
      (is (empty? (t2/select :model/QueryField :card_id card-id))))))
