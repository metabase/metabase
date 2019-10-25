(ns metabase.automagic-dashboards.filters-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.filters :as filters :refer :all]))

;; Replace range with the more specific `:=`.
(expect
  [:and
   [:= [:field-id 2] 42]
   [:= [:fk-> [:field-id 1] [:field-id 9]] "foo"]]
  (inject-refinement [:and
                      [:= [:fk-> [:field-id 1] [:field-id 9]] "foo"]
                      [:and
                       [:> [:field-id 2] 10]
                       [:< [:field-id 2] 100]]]
                     [:= [:field-id 2] 42]))

;; If there's no overlap between filter clauses, just merge using `:and`.
(expect
  [:and
   [:= [:field-id 3] 42]
   [:= [:fk-> [:field-id 1] [:field-id 9]] "foo"]
   [:> [:field-id 2] 10]
   [:< [:field-id 2] 100]]
  (inject-refinement [:and
                      [:= [:fk-> [:field-id 1] [:field-id 9]] "foo"]
                      [:and
                       [:> [:field-id 2] 10]
                       [:< [:field-id 2] 100]]]
                     [:= [:field-id 3] 42]))
