(ns metabase.automagic-dashboards.core-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :as field]
             [table :as table]]
            [metabase.automagic-dashboards
             [core :refer :all :as magic]
             [rules :as rules]]))

(expect
  [[:field-id 1]
   [:fk-> 1 2]
   42]
  (map (partial #'magic/->reference :mbql)
       [(-> (field/->FieldInstance) (assoc :id 1))
        (-> (field/->FieldInstance) (assoc :id 1 :fk_target_field_id 2))
        42]))

(expect
  [:type/GenericTable
   :type/UserTable]
  (map (comp :table_type (partial #'magic/best-matching-rule (rules/load-rules)))
       [{}
        {:entity_type :type/UserTable}]))
