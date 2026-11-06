(ns metabase.serialization.data-model-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(deftest extract-fields-test
  (testing "Fields export with their references, in as many queries for many Fields as for few"
    (let [fields  (t2/select :model/Field :table_id (mt/id :venues) {:order-by [[:id :asc]]})
          extract #(into [] (serialization/export :model/Field %))
          db-name (t2/select-one-fn :name :model/Database :id (mt/id))
          [price] (extract [(t2/select-one :model/Field :id (mt/id :venues :price))])]
      (is (=? {:serdes/meta [{:model "Field"}]
               :name        "PRICE"
               :table_id    [db-name "PUBLIC" "VENUES"]}
              price))
      (is (= [:model/Field [db-name "PUBLIC" "VENUES" "PRICE"]] (serialization/key-of price)))
      (testing "(without FK targets, which take their own query)"
        (let [fields (remove :fk_target_field_id fields)]
          (is (= (query-count #(extract (take 1 fields)))
                 (query-count #(extract fields)))))))))

(deftest field-round-trip-test
  (testing "an exported Field imports back to the same references"
    (let [field            (t2/select-one :model/Field :id (mt/id :venues :category_id))
          [exported]       (into [] (serialization/export :model/Field [field]))
          [imported]       (serialization/import :model/Field [exported])]
      (is (=? {:table_id           (mt/id :venues)
               :name               "CATEGORY_ID"
               :fk_target_field_id (mt/id :categories :id)}
              imported))
      (is (nil? (:parent_id imported))))))

(deftest extract-tables-test
  (testing "Tables export their Database by name, with one query for the names of all of them"
    (let [tables (t2/select :model/Table :db_id (mt/id) {:order-by [[:id :asc]]})
          db     (t2/select-one-fn :name :model/Database :id (mt/id))]
      (is (every? #(= db (:db_id %)) (into [] (serialization/export :model/Table tables))))
      (is (= (query-count #(into [] (serialization/export :model/Table (take 1 tables))))
             (query-count #(into [] (serialization/export :model/Table tables))))))))

(deftest legacy-field-dimensions-load-test
  (testing "older exports nest a Field's Dimension under it, which loads as the Field's Dimension"
    (mt/with-model-cleanup [:model/Dimension]
      (let [db-name  (t2/select-one-fn :name :model/Database :id (mt/id))
            [field]  (into [] (serialization/export :model/Field [(t2/select-one :model/Field :id (mt/id :venues :category_id))]))
            eid      "LegacyDimension000001"]
        (serialization/load :model/Field [(assoc field :dimensions [{:entity_id               eid
                                                                     :name                    "Category"
                                                                     :type                    "external"
                                                                     :human_readable_field_id [db-name "PUBLIC" "CATEGORIES" "NAME"]}])])
        (is (=? {:field_id                (mt/id :venues :category_id)
                 :human_readable_field_id (mt/id :categories :name)
                 :type                    :external}
                (t2/select-one :model/Dimension :entity_id eid)))))))
