(ns metabase.feature-extraction.automagic-dashboards-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :as field]
             [table :as table]]
            [metabase.feature-extraction.automagic-dashboards :refer :all :as magic]))

(expect
  [0
   1
   0
   0.5]
  (map #'magic/boolean->probability [false true nil 0.5]))

(expect
  [nil
   1
   (/ 2)]
  (map #(#'magic/name-contains? "foo" {:name %}) ["" "foo" "foobar"]))

(expect
  [false
   false
   true]
  (map (comp boolean #'magic/template-var?) [:foo "foo" "?foo"]))

(expect
  42
  (#'magic/unify-var {"foo" 42} "?foo"))

(expect
  true
  (-> (#'magic/load-rules) count pos?))

(expect
  [[:field-id 1]
   [:fk-> 1 2]
   1]
  (map #'magic/->reference
       [(-> (field/->FieldInstance) (assoc :id 1))
        (-> (field/->FieldInstance) (assoc :id 1 :fk_target_field_id 2))
        (-> (table/->TableInstance) (assoc :id 1))]))

(expect
  [1.0
   0
   1.0
   0.5]
  (map #(#'magic/apply-rule #'magic/name-contains? % {:name "foobar"})
       ["foobar"
        "baz"
        ["foo" "foobar"]
        [["foo" 1.0] ["foobar" 0.2]]]))

(expect
  ["select sum(INCOME) from ORDERS"
   {:source_table 1
    :aggregation [:sum [:field-id 1]]}]
  (map (partial #'magic/unify-vars {"orders" (-> (table/->TableInstance)
                                                 (assoc :id 1)
                                                 (assoc :name "ORDERS"))
                                    "income" (-> (field/->FieldInstance)
                                                 (assoc :id 1)
                                                 (assoc :name "INCOME")) })
       ["select sum(?income) from ?orders"
        {:source_table "?orders"
         :aggregation [:sum "?income"]}]))
