(ns metabase.sync-database.analyze-test
  (:require [expectations :refer :all]
            [metabase.sync-database.analyze :refer :all]
            [metabase.test.util :as tu]))


;; test:cardinality-and-extract-field-values
;; (#2332) check that if field values are long we skip over them
(expect
  {:values nil}
  (with-redefs-fn {#'metabase.db.metadata-queries/field-distinct-values (fn [_ _]
                                                                          [(clojure.string/join (repeat 5000 "A"))])}
    #(test:cardinality-and-extract-field-values {} {})))

(expect
  {:values       [1 2 3 4]
   :special-type :category}
  (with-redefs-fn {#'metabase.db.metadata-queries/field-distinct-values (fn [_ _]
                                                                          [1 2 3 4])}
    #(test:cardinality-and-extract-field-values {} {})))


;;; ## mark-json-field!

(tu/resolve-private-fns metabase.sync-database.analyze values-are-valid-json?)

(def ^:const ^:private fake-values-seq-json
  "A sequence of values that should be marked is valid JSON.")

;; When all the values are valid JSON dicts they're valid JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"]))

;; When all the values are valid JSON arrays they're valid JSON
(expect true
  (values-are-valid-json? ["[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; Some combo of both can still be marked as JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; If the values have some valid JSON dicts but is mostly null, it's still valid JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           nil
                           nil]))

;; If every value is nil then the values should not be considered valid JSON
(expect false
  (values-are-valid-json? [nil, nil, nil]))

;; Check that things that aren't dictionaries or arrays aren't marked as JSON
(expect false (values-are-valid-json? ["\"A JSON string should not cause a Field to be marked as JSON\""]))
(expect false (values-are-valid-json? ["100"]))
(expect false (values-are-valid-json? ["true"]))
(expect false (values-are-valid-json? ["false"]))


;; TODO: analyze-table-data-shape!

;; TODO: analyze-data-shape-for-tables!
