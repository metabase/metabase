(ns metabase.sync.analyze.classifiers.name-test
  (:require [expectations :refer :all]
            [metabase.models.table :as table]
            [metabase.sync.analyze.classifiers.name :refer :all]))

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
