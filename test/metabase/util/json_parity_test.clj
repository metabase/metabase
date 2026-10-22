(ns metabase.util.json-parity-test
  "Checks that [[metabase.util.json]] reads and writes JSON like cheshire did before oda replaced it, and pins down
  where the two differ on purpose."
  (:require
   ;; the reference implementation that oda replaced
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as cheshire]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private unicode-string
  ;; any code point but lone surrogates, which neither library can write losslessly
  (gen/fmap (fn [code-points]
              (String. (int-array code-points) 0 (count code-points)))
            (gen/vector (gen/one-of [(gen/choose 0 0xD7FF) (gen/choose 0xE000 0x10FFFF)]))))

(def ^:private finite-double
  (gen/double* {:infinite? false :NaN? false}))

(def ^:private scalar
  (gen/one-of [gen/string
               unicode-string
               gen/large-integer
               gen/size-bounded-bigint
               finite-double
               (gen/fmap float (gen/double* {:infinite? false :NaN? false :min -3e38 :max 3e38}))
               (gen/fmap #(BigDecimal. (str %)) finite-double)
               gen/boolean
               (gen/return nil)
               gen/keyword
               gen/keyword-ns
               gen/symbol-ns
               gen/uuid
               gen/char
               (gen/fmap #(java.util.Date. (long %)) (gen/choose 0 4102444800000))]))

(def ^:private map-key
  (gen/one-of [unicode-string
               gen/keyword
               gen/keyword-ns
               gen/symbol-ns
               gen/large-integer
               finite-double
               gen/boolean
               gen/uuid
               (gen/return nil)
               (gen/fmap #(java.time.LocalDate/ofEpochDay %) (gen/choose 0 50000))
               (gen/vector gen/small-integer 0 3)]))

(def ^:private value
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner)
                                    (gen/list inner)
                                    (gen/set inner)
                                    (gen/map map-key inner)]))
                     scalar))

(defn- cheshire-encode [x]
  (cheshire/generate-string x {:date-format json/default-date-format}))

(defn- normalize-escapes
  "Lower-cases the hex digits of `\\uXXXX` escapes: Jackson writes them upper-case, oda lower-case."
  [s]
  (str/replace s #"\\u([0-9A-Fa-f]{4})" (fn [[_ hex]] (str "\\u" (u/lower-case-en hex)))))

;; defspec-generated test var; the runner finds it via metadata, clojure-lsp sees no reference
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defspec encode-like-cheshire-test 1000
  (prop/for-all [x value]
    (= (normalize-escapes (cheshire-encode x))
       (normalize-escapes (json/encode x)))))

(defn- types
  "The types in `x`, depth first. Cheshire reads integers that fit as Integers, oda as Longs: both are the same
  numbers to Clojure."
  [x]
  (map #(if (instance? Integer %) Long (type %))
       (tree-seq coll? seq x)))

;; defspec-generated test var; the runner finds it via metadata, clojure-lsp sees no reference
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defspec decode-like-cheshire-test 1000
  (prop/for-all [s (gen/fmap cheshire-encode value)
                 key-fn (gen/elements [nil true])]
    (let [expected (cheshire/parse-string-strict s key-fn)
          actual   (json/decode s key-fn)]
      (and (= expected actual)
           (= (types expected) (types actual))))))

(deftest ^:parallel encode-number-edge-cases-test
  (doseq [x [-0.0 0.0 1e21 1e-7 1e-5 Double/MIN_VALUE Double/MAX_VALUE 0.1 (+ 0.1 0.2) (float 1.1) (float 3.4e38)
             1/3 Long/MIN_VALUE Long/MAX_VALUE (bigint 1e30) 1E+400M 1.000M -0.00M (int 5) (short 3) (byte 1)]]
    (testing (pr-str x)
      (is (= (cheshire-encode x) (json/encode x))))))

(deftest ^:parallel known-differences-test
  (testing "integers decode as Longs (cheshire: Integers when they fit)"
    (is (instance? Long (json/decode "1"))))
  (testing "a lone surrogate encodes as U+FFFD (cheshire: ?)"
    (is (= "\"�\"" (json/encode "\uD800"))))
  (testing "content after the value throws (cheshire: ignored)"
    (is (thrown? Exception (json/decode "{} x"))))
  (testing "a leading byte order mark is skipped (cheshire: throws)"
    (is (= [1] (json/decode "﻿[1]"))))
  (testing "an unescaped control character in a string throws (cheshire: allowed)"
    (is (thrown? Exception (json/decode "\"a\nb\"")))))
