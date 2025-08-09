(ns metabase.lib.schema.parameter-test
  (:require
   [clojure.test :refer [are deftest]]
   [malli.error :as me]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel parameter-schema-test
  (are [x] (not (me/humanize (mr/explain ::lib.schema.parameter/parameter x)))
    {:type   :category
     :target [:variable [:field 71725 nil]]
     :value  50}))

(deftest ^:parallel normalize-dimension-test
  (are [x expected] (= expected
                       (lib.normalize/normalize
                        ::lib.schema.parameter/dimension
                        x))
    ["dimension" ["field" 29 {"base-type" "type/Integer"}]]
    [:dimension [:field 29 {:base-type :type/Integer}]]

    ["dimension" ["expression" "wow"]]
    [:dimension [:expression "wow"]]))
