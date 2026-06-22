(ns metabase.util.json-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest ^:synchronized decode-does-not-retain-jackson-parser-test
  (let [n      1000000
        input  (repeat n "[]")
        used   (fn [] (dotimes [_ 4] (System/gc)) (let [r (Runtime/getRuntime)] (- (.totalMemory r) (.freeMemory r))))
        before (used)
        result (into [] (map json/decode) input)
        mb     (/ (double (- (used) before)) 1048576.0)]
    (is (= n (count result)))
    (is (vector? (first result)))
    (is (< mb 300.0)
        (format "decoding %,d JSON arrays retained ~%.0f MB; `parse-string` pins a Jackson parser per value (GBs), `parse-string-strict` does not"
                n mb))))
