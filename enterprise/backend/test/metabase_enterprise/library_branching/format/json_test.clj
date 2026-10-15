(ns metabase-enterprise.library-branching.format.json-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.json :as json]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util.json :as mb.json]))

(set! *warn-on-reflection* true)

(def ^:private text-gen
  "Strings of any plane, with characters that JSON escapes."
  (gen/one-of [gen/string
               lb.tu/unicode-name-gen
               (gen/elements ["" "a/b" "say \"hi\"" "back\\slash" "tab\tline\n" "\u0000\u001f" "[\"ref\"]"])]))

(def ^:private scalar-gen
  (gen/one-of [text-gen
               gen/large-integer
               gen/size-bounded-bigint
               (gen/double* {:infinite? false :NaN? false})
               gen/boolean
               (gen/return nil)]))

(def ^:private key-gen
  (gen/fmap keyword (gen/one-of [text-gen (gen/elements ["base-type" "source-field" "a/b"])])))

(def ^:private value-gen
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner 0 4)
                                    (gen/fmap #(into {} %) (gen/vector (gen/tuple key-gen inner) 0 4))]))
                     scalar-gen))

(def ^:private encode-opts-gen
  (gen/elements [{} {:pretty true} {:escape-non-ascii true}]))

(defspec parse-inverts-encode-test 300
  (prop/for-all [v    value-gen
                 opts encode-opts-gen]
    (= v (json/parse (mb.json/encode v opts)))))

(deftest parse-test
  (testing "escapes, numbers and white space"
    (is (= ["ref" ["field" ["a/b" nil "T" "é😀"] {:base-type "type/Integer" :x 1500.0 :y 0 :z false}]]
           (json/parse (str " [\"ref\" ,\n[\"field\",[\"a\\/b\",null,\"T\",\"\\u00e9\\ud83d\\ude00\"],"
                            "{\"base-type\":\"type/Integer\",\"x\":1.5e3,\"y\":-0,\"z\":false}]]\t")))))
  (testing "an integer past the range of a long"
    (is (= 99999999999999999999999N (json/parse "99999999999999999999999"))))
  (testing "of two entries with one key, the second one stays"
    (is (= {:a 2} (json/parse "{\"a\":1,\"a\":2}")))))

(deftest invalid-text-test
  (doseq [s ["" " " "[1,]" "[,1]" "[1 2]" "{\"a\" 1}" "{\"a\":}" "{a:1}" "{\"a\":1,}" "[1] x" "01" "1." ".5" "+1"
             "-" "1e" "\"a" "\"a\nb\"" "\"\\x\"" "\"\\u12\"" "nul" "True" "[" "{" "]" "'a'"]]
    (testing (pr-str s)
      (is (= ::json/invalid
             (try
               (json/parse s)
               (catch clojure.lang.ExceptionInfo e
                 (:type (ex-data e)))))))))

(def ^:private mutations
  [{:name   :no-escapes
    :doc    "A backslash escape is not decoded."
    :target `json/read-string*
    :edits  [[:replace '(contains? escapes e) false]]}
   {:name   :no-unicode-escapes
    :doc    "A \\u escape is not decoded."
    :target `json/read-string*
    :edits  [[:replace '(= \u e) false]]}
   {:name   :control-characters-allowed
    :doc    "A raw control character inside a string is not refused."
    :target `json/read-string*
    :edits  [[:replace '(< (int c) 0x20) false]]}
   {:name   :trailing-text-allowed
    :doc    "Text after the value is not refused."
    :target `json/parse
    :edits  [[:replace '(= (skip-space s i) (.length s)) true]]}
   {:name   :leading-zeros-allowed
    :doc    "The integer form allows leading zeros."
    :target `json/read-number
    :edits  [[:replace '(re-pattern "-?(0|[1-9][0-9]*)") '(re-pattern "-?[0-9]+")]]}
   {:name   :no-big-integers
    :doc    "An integer past the long range is not read."
    :target `json/read-number
    :edits  [[:replace '(bigint text) nil]]}
   {:name   :no-exponents
    :doc    "A number with an exponent is not read."
    :target `json/read-number
    :edits  [[:replace '(re-pattern "-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")
              '(re-pattern "-?(0|[1-9][0-9]*)(\\.[0-9]+)?")]]}
   {:name   :trailing-comma-allowed
    :doc    "A comma before the closing bracket is not refused."
    :target `json/read-elements
    :edits  [[:replace '(recur acc (skip-space s (inc i)))
              '(let [j (skip-space s (inc i))] (if (= close (char-at s j)) [acc (inc j)] (recur acc j)))]]}
   {:name   :keys-not-keywords
    :doc    "Object keys stay strings."
    :target `json/read-entry
    :edits  [[:replace '(keyword k) 'k]]}
   {:name   :no-space-skipped
    :doc    "White space before a value is not skipped."
    :target `json/skip-space
    :edits  [[:replace '(recur s (inc i)) 'i]]}])

(deftest json-mutations-test
  (mut/check mutations {:tests [#'parse-inverts-encode-test #'parse-test #'invalid-text-test]}))
