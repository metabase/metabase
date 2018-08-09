(ns metabase.sync.analyze.classifiers.name-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.sync.analyze.classifiers.name :refer :all]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;; Postfix + pluralization
(expect
  :entity/TransactionTable
  (-> {:name "MY_ORDERS"} table/map->TableInstance infer-entity-type :entity_type))

;; Prefix
(expect
  :entity/ProductTable
  (-> {:name "productcatalogue"} table/map->TableInstance infer-entity-type :entity_type))

;; Don't match in the middle of the name
(expect
  :entity/GenericTable
  (-> {:name "myproductcatalogue"} table/map->TableInstance infer-entity-type :entity_type))

;; Not-match/default
(expect
  :entity/GenericTable
  (-> {:name "foo"} table/map->TableInstance infer-entity-type :entity_type))


;; Don't overwrite PK/FK `special_type`s.
(expect
  nil
  (tt/with-temp* [Table [{table-id :id}]
                  Field [{field-id :id} {:table_id     table-id
                                         :special_type :type/FK
                                         :name         "City"
                                         :base_type    :type/Text}]]
    (-> field-id Field (infer-and-assoc-special-type nil) :special_type)))

;; ... but overwrite other types to alow evolution of our type system
(expect
  :type/City
  (tt/with-temp* [Table [{table-id :id}]
                  Field [{field-id :id} {:table_id     table-id
                                         :special_type :type/Category
                                         :name         "City"
                                         :base_type    :type/Text}]]
    (-> field-id Field (infer-and-assoc-special-type nil) :special_type)))
