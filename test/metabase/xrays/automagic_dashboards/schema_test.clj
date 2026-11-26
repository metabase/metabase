(ns metabase.xrays.automagic-dashboards.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.xrays.automagic-dashboards.schema :as ads]))

(deftest ^:parallel normalize-cell-query-test
  (testing "an MBQL 5 clause in its JSON form"
    (is (= [:=
            {:lib/uuid "a9e9a2a7-4a33-4b6e-a5d7-5b1f3f2f7c11"}
            [:field {:base-type :type/Text, :lib/uuid "0c5f0d3b-5a4e-4f3a-9a35-0d6d2c8a4f22"} "SOURCE"]
            "Affiliate"]
           (lib/normalize ::ads/root.cell-query
                          ["="
                           {"lib/uuid" "a9e9a2a7-4a33-4b6e-a5d7-5b1f3f2f7c11"}
                           ["field" {"base-type" "type/Text", "lib/uuid" "0c5f0d3b-5a4e-4f3a-9a35-0d6d2c8a4f22"} "SOURCE"]
                           "Affiliate"])))))
