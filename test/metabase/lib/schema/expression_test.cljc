(ns metabase.lib.schema.expression-test
  (:require
   [clojure.test :refer [deftest are testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]))

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
