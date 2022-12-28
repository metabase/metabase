(ns metabase.test-runner.assert-exprs.approximately-equal-test
  (:require
   [clojure.test :refer :all]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test-runner.assert-exprs.approximately-equal :as approximately-equal]
   [metabase.util.date-2 :as u.date]
   [schema.core :as s]))

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
  (testing "maps"
    (is (=? {:a int?
             :b {:c [int? String]
                 :d #".*cans$"}}
            {:a 100
             :b {:c [2 "cans"]
                 :d "toucans"}}))
    (testing "extra keys in actual"
      (is (=? {:a 100}
              {:a 100, :b 200})))))

(deftest ^:parallel sequences-test
  (is (=? []
          []))
  (is (=? [nil]
          [nil]))
  (is (=? [1 nil 2]
          [1 nil 2]))
  (is (=? [:a int?]
          [:a 100]))
  (testing "Should enforce that sequences are of the same length"
    (is (= [nil nil (list 'not= nil? nil)]
           (approximately-equal/=?-diff [int? string? nil?]
                                        [1 "two"])))
    (is (= [nil nil (list 'not= nil? nil) (list 'not= nil "cans")]
           (approximately-equal/=?-diff [int? string? nil?]
                                        [1 "two" nil "cans"])))
    (testing "Differentiate between [1 2 nil] and [1 2]"
      ;; these are the same answers [[clojure.data/diff]] would give in these situations. The output is a little more
      ;; obvious in failing tests because you can see the difference between expected and actual in addition to this
      ;; diff.
      (is (= [nil nil nil]
             (approximately-equal/=?-diff [1 2 nil]
                                          [1 2])))
      (is (= [nil nil nil]
             (approximately-equal/=?-diff [1 2]
                                          [1 2 nil]))))))

(deftest ^:parallel custom-approximately-equal-methods
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

(deftest ^:parallel exactly-test
  (testing "#exactly"
    (is (=? {:a 1}
            {:a 1, :b 2}))
    (testing "Fail when things are not exactly the same, as if by `=`"
      ;; these serialize the results to strings because it makes it easier to see what the output will look like when
      ;; printed out which is what we actually care about.
      (is (= "(not (= #exactly {:a 1} {:a 1, :b 2}))"
             (pr-str (approximately-equal/=?-diff #exactly {:a 1} {:a 1, :b 2}))))
      (testing "Inside a map"
        (is (= "{:b (not (= #exactly {:a 1} {:a 1, :b 2}))}"
               (pr-str (approximately-equal/=?-diff {:a 1, :b #exactly {:a 1}}
                                                    {:a 1, :b {:a 1, :b 2}}))))))
    (testing "Should pass when things are exactly the same as if by `=`"
      (is (nil? (approximately-equal/=?-diff #exactly 2 2)))
      (is (=? #exactly 2
              2))
      (testing "should evaluate args"
        (is (=? #exactly (+ 1 1)
                2)))
      (testing "Inside a map"
        (is (=? {:a 1, :b #exactly 2}
                {:a 1, :b 2}))))))

(deftest ^:parallel schema-test
  (testing "#schema"
    (is (=? #schema {:a s/Int}
            {:a 1}))
    (testing "Nested inside a collection"
      (is (=? {:a 1, :b #schema {s/Keyword s/Int}}
              {:a 1, :b {}}))
      (is (=? {:a 1, :b #schema {s/Keyword s/Int}}
              {:a 1, :b {:c 2}}))
      (is (=? {:a 1, :b #schema {s/Keyword s/Int}}
              {:a 1, :b {:c 2, :d 3}})))
    (testing "failures"
      ;; serialize these to strings and read them back out because Schema actually returns weird classes like
      ;; ValidationError or whatever that aren't equal to their printed output
      (is (= '{:a (not (integer? 1.0))}
             (read-string (pr-str (approximately-equal/=?-diff #schema {:a s/Int} {:a 1.0})))))
      (testing "Inside a collection"
        (is (= '{:b {:c (not (integer? 2.0))}}
               (read-string (pr-str (approximately-equal/=?-diff {:a 1, :b #schema {:c s/Int}}
                                                                 {:a 1, :b {:c 2.0}})))))))))

(deftest ^:parallel approx-test
  (testing "#approx"
    (is (=? #approx [1.5 0.1]
            1.51))
    (testing "Nested inside a collection"
      (is (=? {:a 1, :b #approx [1.5 0.1]}
              {:a 1, :b 1.51})))
    ;; failures below render stuff to strings so we can see it the way it will look in test failures with its nice
    ;; comment and whatnot
    (testing "failures"
      (is (= "(not (approx= 1.5 1.6 #_epsilon 0.1))"
             (pr-str (approximately-equal/=?-diff #approx [1.5 0.1] 1.6))))
      (testing "Inside a collection"
        (is (= "{:b (not (approx= 1.5 1.6 #_epsilon 0.1))}"
               (pr-str (approximately-equal/=?-diff {:a 1, :b #approx [1.5 0.1]}
                                                    {:a 1, :b 1.6}))))))
    (testing "Eval the args"
      (is (=? #approx [(+ 1.0 0.5) (- 1.0 0.9)]
              1.51)))
    (testing "A large epsilon"
      (is (=? #approx [1 10.0]
              9.0))
      (is (= "(not (approx= 1 20.0 #_epsilon 10.0))"
             (pr-str (approximately-equal/=?-diff #approx [1 10.0] 20.0)))))
    (testing "nil should not match the #approx method -- fall back to the :default"
      (is (= "(not= #approx [1 0.1] nil)"
             (pr-str (approximately-equal/=?-diff #approx [1 0.1] nil)))))))
