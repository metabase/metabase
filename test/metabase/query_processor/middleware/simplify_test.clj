(ns metabase.query-processor.middleware.simplify-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.simplify :as simplify]))

;; middleware should unwrap `:datetime-field` clauses if it Field is already of the same unit according to the metadata
(expect
  {:source-metadata [{:id 10, :unit :year}]
   :fields          [[:field-id 10]]}
  ((simplify/eliminate-unneeded-datetime-field-casts identity)
   {:source-metadata [{:id 10, :unit :year}]
    :fields          [[:datetime-field [:field-id 10] :year]]}))

;; should work with Field literals as well
(expect
  {:source-metadata [{:name "my_field", :unit :year}]
   :fields          [[:field-literal "my_field" :type/DateTime]]}
  ((simplify/eliminate-unneeded-datetime-field-casts identity)
   {:source-metadata [{:name "my_field", :unit :year}]
    :fields          [[:datetime-field [:field-literal "my_field" :type/DateTime] :year]]}))

;; if unit is different, it shouldn't make the transformation
(expect
  {:source-metadata [{:id 10, :unit :month}]
   :fields          [[:datetime-field [:field-id 10] :year]]}
  ((simplify/eliminate-unneeded-datetime-field-casts identity)
   {:source-metadata [{:id 10, :unit :month}]
    :fields          [[:datetime-field [:field-id 10] :year]]}))

;; should work at arbitrary levels of nesting...
(expect
  {:source-query    {:source-query {:source-metadata [{:id 10, :unit :year}]
                                    :fields          [[:field-id 10]]}}
   :source-metadata [{:id 20, :unit :month}]
   :fields          [[:field-id 20]]}
  ((simplify/eliminate-unneeded-datetime-field-casts identity)
   {:source-query    {:source-query {:source-metadata [{:id 10, :unit :year}]
                                     :fields          [[:datetime-field [:field-id 10] :year]]}}
    :source-metadata [{:id 20, :unit :month}]
    :fields          [[:datetime-field [:field-id 20] :month]]}))

;; ...but source-metadata should only affect things in the same level.
(expect
  {:source-query {:source-query {:fields [[:datetime-field [:field-id 10] :month]]}}
   :source-metadata [{:id 10, :unit :month}]
   :fields          [[:field-id 10]]}
  ((simplify/eliminate-unneeded-datetime-field-casts identity)
   {:source-query {:source-query {:fields [[:datetime-field [:field-id 10] :month]]}}
    :source-metadata [{:id 10, :unit :month}]
    :fields          [[:datetime-field [:field-id 10] :month]]}))
