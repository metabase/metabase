(ns metabase.lib.schema.literal.jvm-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel temporal-literal-type-of-test
  (is (= :type/DateTimeWithZoneID
         (expression/type-of-method #t "2019-01-01T00:00Z[UTC]"))))
