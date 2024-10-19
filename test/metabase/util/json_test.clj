(ns metabase.util.json-test
  (:require [cheshire.core :as cheshire]
            [clojure.test :refer :all]
            [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest cheshire-equivalency-test
  (testing "objects with custom encoders are encoded the same as in Cheshire"
    (are [object] (let [o object] (= (json/encode o) (cheshire/encode o)))
      (byte-array (range 60 80))
      (java.time.Instant/now))))
