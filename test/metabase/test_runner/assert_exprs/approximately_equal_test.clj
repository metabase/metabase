(ns metabase.test-runner.assert-exprs.approximately-equal-test
  (:require
   [clojure.test :refer :all]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test-runner.assert-exprs.approximately-equal :as approximately-equal]
   [metabase.util.date-2 :as u.date]))

(comment test-runner.assert-exprs/keep-me)

(deftest ^:parallel passing-tests
  (testing "basic equality"
    (is (=? 100 100)))
  (testing "predicate function"
    (is (=? int? 100)))
  (testing "regexes"
    (is (=? #"cans$" "cans")))
  (testing "classes"
    (is (=? String
            "toucans")))
  (testing "regexes"
    (is (=? #"\d+cans$"
            #"\d+cans$")))
  (testing "sequences"
    (is (=? [:a int?]
            [:a 100])))
  (testing "maps"
    (is (=? {:a int?
             :b {:c [int? String]
                 :d #"cans$"}}
            {:a 100
             :b {:c [2 "cans"]
                 :d "toucans"}}))
    (testing "extra keys in actual"
      (is (=? {:a 100}
              {:a 100, :b 200})))))

(deftest custom-approximately-equal-methods
  (is (=? {[String java.time.temporal.Temporal]
           (fn [_next-method expected actual]
             (let [actual-str (u.date/format actual)]
               (when-not (= expected actual-str)
                 (list 'not= expected (symbol "#t") actual-str))))}
          "2022-07-14"
          #t "2022-07-14"))

  (is (=? {[String String]
           (fn [_next-method ^String expected ^String actual]
             (when-not (zero? (.compareToIgnoreCase expected actual))
               (list 'not (list 'zero? (list '.compareToIgnoreCase expected actual)))))}
          {:a "AbC"}
          {:a "abc", :b 100})))

(deftest exactly-test
  (testing "#exactly"
    (is (=? {:a 1}
            {:a 1, :b 2}))
    (testing "Fail when things are not exactly the same, as if by `=`"
      ;; convert to a string because otherwise two regexes aren't equal and I didn't want to use `?=` to test itself.
      (is (= `(~'not (~'= ~(symbol "#exactly") {:a 1} {:a 1, :b 2}))
             (approximately-equal/=?-diff #exactly {:a 1} {:a 1, :b 2})))
      (testing "Inside a map"
        (is (= `{:b (~'not (~'= ~(symbol "#exactly") {:a 1} {:a 1, :b 2}))}
               (approximately-equal/=?-diff {:a 1, :b #exactly {:a 1}}
                                            {:a 1, :b {:a 1, :b 2}})))))
    (testing "Should pass when things are exactly the same as if by `=`"
      (is (nil? (approximately-equal/=?-diff #exactly 2 2)))
      (is (=? #exactly 2
              2))
      (testing "Inside a map"
        (is (=? {:a 1, :b #exactly 2}
                {:a 1, :b 2}))))))
