(ns metabase-enterprise.security-center.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.schema :as schema]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel semver-test
  (testing "accepts versions with any number of dot-separated numeric segments"
    (doseq [v ["1.57" "1.57.19" "0.50.2" "1.58.14" "10.0.0"
               "1.57.19.1" "1.58.14.1" "1.57.19.1.2"]]
      (is (mr/validate ::schema/semver v)
          v)))
  (testing "rejects non-versions"
    (doseq [v ["1." ".1" "1..2" "foo" "1.57.x"]]
      (is (not (mr/validate ::schema/semver v))
          v))))
