(ns metabase.warehouse-schema.models.dimension-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-dimension-call-count
  "The number of app-DB statements an insert of an external Dimension of the Field with `field-id`, showing the Field
  with `human-readable-id`, runs; the Dimension is deleted afterwards."
  [field-id human-readable-id]
  (let [[dimension-id call-count] (t2/with-call-count [call-count]
                                    [(t2/insert-returning-pk! :model/Dimension
                                                              {:field_id                field-id
                                                               :human_readable_field_id human-readable-id
                                                               :type                    :external
                                                               :name                    "Product"})
                                     (call-count)])]
    (t2/delete! :model/Dimension :id dimension-id)
    call-count))

(defn- refusal
  "The status code and message of the exception `thunk` throws, nil when it throws none."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [status-code errors]} (ex-data e)]
        [status-code (first (vals errors))]))))

(deftest human-readable-field-check-reads-databases-once-test
  (testing "second Dimension of same Fields reads neither Database again"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {products :id} {:db_id db-id :name "PRODUCTS"}
                   :model/Table    {orders :id}   {:db_id db-id :name "ORDERS"}
                   :model/Field    {title-id :id} {:table_id products :name "TITLE" :base_type :type/Text}
                   :model/Field    {fk-id :id}    {:table_id orders :name "PRODUCT_ID" :base_type :type/Integer}]
      (let [first-count  (insert-dimension-call-count fk-id title-id)
            second-count (insert-dimension-call-count fk-id title-id)]
        (is (= 2 (- first-count second-count)))))))

(deftest human-readable-field-check-messages-test
  (mt/with-temp [:model/Database {db-1 :id}     {}
                 :model/Database {db-2 :id}     {}
                 :model/Table    {orders :id}   {:db_id db-1 :name "ORDERS"}
                 :model/Table    {people :id}   {:db_id db-2 :name "PEOPLE"}
                 :model/Field    {fk-id :id}    {:table_id orders :name "USER_ID" :base_type :type/Integer}
                 :model/Field    {name-id :id}  {:table_id people :name "NAME" :base_type :type/Text}]
    (testing "Field of other Database is refused on each insert"
      (dotimes [_ 2]
        (is (= [400 "Target field must belong to the same database"]
               (refusal #(insert-dimension-call-count fk-id name-id))))))
    (testing "missing Field is refused on each insert"
      (let [missing-id (+ 1000000 (t2/select-one-fn :max-id [:model/Field [:%max.id :max-id]]))]
        (dotimes [_ 2]
          (is (= [400 "Invalid target field"]
                 (refusal #(insert-dimension-call-count fk-id missing-id)))))))))
