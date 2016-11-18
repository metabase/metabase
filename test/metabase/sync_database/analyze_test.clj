(ns metabase.sync-database.analyze-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.sync-database.analyze :refer :all]
            [metabase.test.util :as tu]))


;; test:cardinality-and-extract-field-values
;; (#2332) check that if field values are long we skip over them
(expect
  {:values nil}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [(str/join (repeat 5000 "A"))])}
    #(test:cardinality-and-extract-field-values {} {})))

(expect
  {:values       [1 2 3 4]
   :special-type :type/Category}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [1 2 3 4])}
    #(test:cardinality-and-extract-field-values {} {})))


;;; ## mark-json-field!

(tu/resolve-private-vars metabase.sync-database.analyze values-are-valid-json?)
(tu/resolve-private-vars metabase.sync-database.analyze values-are-valid-emails?)

(def ^:const ^:private fake-values-seq-json
  "A sequence of values that should be marked is valid JSON.")

;; When all the values are valid JSON dicts they're valid JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"]))

;; When all the values are valid JSON arrays they're valid JSON
(expect
  (values-are-valid-json? ["[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; Some combo of both can still be marked as JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; If the values have some valid JSON dicts but is mostly null, it's still valid JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           nil
                           nil]))

;; If every value is nil then the values should not be considered valid JSON
(expect false
  (values-are-valid-json? [nil nil nil]))

;; Check that things that aren't dictionaries or arrays aren't marked as JSON
(expect false (values-are-valid-json? ["\"A JSON string should not cause a Field to be marked as JSON\""]))
(expect false (values-are-valid-json? ["100"]))
(expect false (values-are-valid-json? ["true"]))
(expect false (values-are-valid-json? ["false"]))

;; Check that things that are valid emails are marked as Emails
(expect true (values-are-valid-emails? ["helper@metabase.com"]))
(expect true (values-are-valid-emails? ["helper@metabase.com", "someone@here.com", "help@nope.com"]))
(expect true (values-are-valid-emails? ["helper@metabase.com", nil, "help@nope.com"]))

(expect false (values-are-valid-emails? ["helper@metabase.com", "1111IsNot!An....email", "help@nope.com"]))
(expect false (values-are-valid-emails? ["\"A string should not cause a Field to be marked as email\""]))
(expect false (values-are-valid-emails? [100]))
(expect false (values-are-valid-emails? ["true"]))
(expect false (values-are-valid-emails? ["false"]))
