(ns metabase.util.jvm-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.util :as u]))

(deftest ^:parallel host-up?-test
  (testing "host-up?"
    (are [s expected] (= expected
                         (u/host-up? s))
      "localhost"  true
      "nosuchhost" false))
  (testing "host-port-up?"
    (is (= false
           (u/host-port-up? "nosuchhost" 8005)))))

(deftest ^:parallel ip-address?-test
  (are [x expected] (= expected
                       (u/ip-address? x))
    "8.8.8.8"              true
    "185.233.100.23"       true
    "500.1.1.1"            false
    "192.168.1.a"          false
    "0:0:0:0:0:0:0:1"      true
    "52.206.149.9"         true
    "2001:4860:4860::8844" true
    "wow"                  false
    "   "                  false
    ""                     false
    nil                    false
    100                    false))

;; this would be such a good spot for test.check
(deftest ^:parallel sorted-take-test
  (testing "It ensures there are never more than `size` items in the priority queue"
    (let [limit 5
          rf    (u/sorted-take limit compare)]
      (reduce (fn [q x]
                (let [_q' (rf q x)]
                  ;; a bit internal but this is really what we're after: bounded size while we look for the biggest
                  ;; elements
                  (is (<= (count q) limit))
                  q))
              (rf)
              (shuffle (range 30))))))

(defspec sorted-take-test-size
  (prop/for-all [coll (gen/list (gen/tuple gen/small-integer gen/string))
                 size (gen/fmap inc gen/nat)]
                (= (vec (take-last size (sort coll)))
                   (transduce (map identity)
                              (u/sorted-take size compare)
                              coll))))

(defspec sorted-take-test-comparator
  (prop/for-all [coll (gen/list (gen/fmap (fn [x] {:score x}) gen/small-integer))
                 size (gen/fmap inc gen/nat)]
                (let [coll    (shuffle coll)
                      kompare (fn [{score-1 :score} {score-2 :score}]
                                (compare score-1 score-2))]
                  (= (vec (take-last size (sort-by identity kompare coll)))
                     (transduce (map identity)
                                (u/sorted-take size kompare)
                                coll)))))

(deftest ^:parallel full-exception-chain-test
  (testing "Not an Exception"
    (is (= nil
           (u/full-exception-chain nil)))
    (is (= nil
           (u/full-exception-chain 100))))
  (testing "No causes"
    (let [e (ex-info "A" {:a 1})]
      (is (= ["A"]
             (map ex-message (u/full-exception-chain e))))
      (is (= [{:a 1}]
             (map ex-data (u/full-exception-chain e))))))
  (testing "w/ causes"
    (let [e (ex-info "A" {:a 1} (ex-info "B" {:b 2} (ex-info "C" {:c 3})))]
      (is (= ["A" "B" "C"]
             (map ex-message (u/full-exception-chain e))))
      (is (= [{:a 1} {:b 2} {:c 3}]
             (map ex-data (u/full-exception-chain e)))))))

(deftest ^:parallel parse-currency-test
  (are [s expected] (= expected
                       (u/parse-currency s))
    nil             nil
    ""              nil
    "   "           nil
    "$1,000"        1000.0M
    "$1,000,000"    1000000.0M
    "$1,000.00"     1000.0M
    "€1.000"        1000.0M
    "€1.000,00"     1000.0M
    "€1.000.000,00" 1000000.0M
    "-£127.54"      -127.54M
    "-127,54 €"     -127.54M
    "kr-127,54"     -127.54M
    "€ 127,54-"     -127.54M
    "¥200"          200.0M
    "¥200."         200.0M
    "$.05"          0.05M
    "0.05"          0.05M))
