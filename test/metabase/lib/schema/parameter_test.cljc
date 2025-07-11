(ns metabase.lib.schema.parameter-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.parameter :as lib.schema.parameter]))

(deftest ^:parallel normalize-dimension-test
  (are [x expected] (= expected
                       (lib.normalize/normalize
                        ::lib.schema.parameter/dimension
                        x))
    ["dimension" ["field" 29 {"base-type" "type/Integer"}]]
    [:dimension [:field 29 {:base-type :type/Integer}]]

    ["dimension" ["expression" "wow"]]
    [:dimension [:expression "wow"]]))
