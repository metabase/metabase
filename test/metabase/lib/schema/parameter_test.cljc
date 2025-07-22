(ns metabase.lib.schema.parameter-test
  (:require
   [clojure.test :refer [are deftest testing]]
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

(deftest ^:parallel normalize-between-parameter-test
  (testing ":between parameters with only one arg should get normalized to :<= or :>="
    (are [values expected-type] (= {:type   expected-type
                                    :target [:dimension [:field {:source-field 5} 26]]
                                    :value  [1]}
                                   (lib.normalize/normalize ::lib.schema.parameter/parameter
                                                            {:type   :number/between
                                                             :target [:dimension [:field {:source-field 5} 26]]
                                                             :value  values}))
      [1]     :number/>=
      [1 nil] :number/>=
      [nil 1] :number/<=)))
