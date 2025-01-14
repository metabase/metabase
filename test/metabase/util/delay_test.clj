(ns ^:mb/once metabase.util.delay-test
  (:require [clojure.test :refer :all]
            [metabase.util.delay :as delay]))

(set! *warn-on-reflection* true)

(deftest delay-with-ttl-test
  (let [d (delay/delay-with-ttl 300 #(Object.))
        val1 @d
        val2 @d
        _ (Thread/sleep 500)
        val3 @d]
    (is (= val1 val2))
    (is (not= val3 val2))))
