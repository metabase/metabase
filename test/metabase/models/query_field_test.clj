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
          tax-id   (mt/id :orders :tax)
          total-id (mt/id :orders :total)]
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
  "Update the card to an arbitrary query; defaults to querying the two columns that do exist: TAX and TOTAL"
  ([card-id]
   (trigger-parse! card-id "SELECT TAX, TOTAL FROM orders"))
  ([card-id query]
   (t2/update! :model/Card card-id {:dataset_query (mt/native-query {:query query})})))

;;;;
;;;; Actual tests
;;;;

(deftest query-fields-created-by-queries-test
  (with-test-setup
    (let [total-qf {:card_id  card-id
                    :field_id total-id}
          tax-qf   {:card_id  card-id
                    :field_id tax-id}]

      (testing "A freshly created card has relevant corresponding QueryFields"
        (is (= #{total-qf}
               (query-fields-for-card card-id))))

      (testing "Adding new columns to the query also adds the QueryFields"
        (trigger-parse! card-id)
        (is (= #{tax-qf total-qf}
               (query-fields-for-card card-id))))

      (testing "Removing columns from the query removes the Queryfields"
        (trigger-parse! card-id "SELECT tax, not_total FROM orders")
        (is (= #{tax-qf}
               (query-fields-for-card card-id)))))))

(deftest bogus-queries-test
  (with-test-setup
    (testing "Updating a query with bogus columns does not create QueryFields"
      (trigger-parse! card-id "SELECT DOES, NOT_EXIST FROM orders")
      (is (empty? (t2/select :model/QueryField :card_id card-id))))))
