(ns metabase.automagic-dashboards.core-test
  (:require [expectations :refer :all]
            [metabase.models.table :as table]
            [metabase.sync.analyze.classifiers.name :refer :all]))

;; Postfix + pluralization
(expect
  :type/TransactionTable
  (-> {:name "MY_ORDERS"} table/map->TableInstance infer-entity-type :entity_type))

;; Prefix
(expect
  :type/ProductTable
  (-> {:name "productcatalogue"} table/map->TableInstance infer-entity-type :entity_type))

;; Don't match in the middle of the name
(expect
  :type/GenericTable
  (-> {:name "myproductcatalogue"} table/map->TableInstance infer-entity-type :entity_type))

;; Not-match/default
(expect
  :type/GenericTable
  (-> {:name "foo"} table/map->TableInstance infer-entity-type :entity_type))
