(ns metabase.lib.schema.literal-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.literal]))

(comment metabase.lib.schema.literal/keep-me)

(deftest ^:parallel string-literal-type-of-test
  (are [s expected] (= expected
                       (expression/type-of s))
    ""                 :type/Text
    "abc"              :type/Text
    "2023"             :type/Text
    "2023-03-08"       #{:type/Text :type/Date}
    "03:18"            #{:type/Text :type/Time}
    "2023-03-08T03:18" #{:type/Text :type/DateTime}))
