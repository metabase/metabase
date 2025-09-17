(ns metabase.lib.schema.expression-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel comparable-expressions?-test
  (let [abs-datetime [:absolute-datetime {:lib/uuid (str (random-uuid))}
                      "2015-06-01T00:00Z" :day]]
    (testing "positive examples"
      (are [e0 e1] (lib.schema.expression/comparable-expressions? e0 e1)
        "hello!" "szia!"
        19.43 42
        abs-datetime abs-datetime
        abs-datetime "2023-01-01"
        "2023-11-13T20:12:05" abs-datetime
        (lib/ref (meta/field-metadata :orders :subtotal)) 100))
    (testing "negative examples"
      (are [e0 e1] (not (lib.schema.expression/comparable-expressions? e0 e1))
        "42" 42
        abs-datetime 42
        abs-datetime "2023"
        (lib/ref (meta/field-metadata :orders :subtotal)) "2023-11-13"))))

(deftest ^:parallel duplicate-expressions-test
  (testing "we should disallow expressions with duplicate names (QUE-1412)"
    (letfn [(expression-with-names [name-1 name-2]
              [(-> (lib/+ 1 2)
                   (lib.options/update-options assoc :lib/expression-name name-1))
               (-> (lib/+ 3 4)
                   (lib.options/update-options assoc :lib/expression-name name-2))])
            (error [expr]
              (me/humanize (mr/explain ::lib.schema.expression/expressions expr)))]
      (is (not (error (expression-with-names "A" "B"))))
      (is (= ["expressions must have unique names"]
             (error (expression-with-names "A" "A")))))))
