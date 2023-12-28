(ns metabase.lib.schema.mbql-clause-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema.filter]
   [metabase.lib.schema.literal]
   [metabase.lib.schema.mbql-clause :as mbql-clause]))

(comment metabase.lib.schema.filter/keep-me
         metabase.lib.schema.literal/keep-me)

(deftest ^:parallel schema-test
  (is (mc/validate
       ::mbql-clause/clause
       [:contains {:lib/uuid "1527d17e-a2f0-4e5f-a92b-65d1db90c094"} "x" "y"]))
  (testing "1 should not be allowed as a <string> arg"
    (is (not (mc/validate
              ::mbql-clause/clause
              [:contains {:lib/uuid "1527d17e-a2f0-4e5f-a92b-65d1db90c094"} "x" 1])))))

(deftest ^:parallel resolve-schema-test
  (testing "Schema should be registered"
    (is (mbql-clause/resolve-schema :contains)))
  (testing "Schema should be valid"
    (is (mc/schema (mbql-clause/resolve-schema :contains)))))
