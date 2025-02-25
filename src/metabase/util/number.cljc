(ns metabase.util.number
  "Number helper functions that abstract differences between CLJ and CLJS."
  (:refer-clojure :exclude [bigint integer?])
  (:require
   [clojure.core :as core]))

(defn bigint
  "Coerce a number or a string to BigInt. Throws if coercion cannot be made."
  [x]
  #?(:clj (core/bigint x)
     :cljs (js/BigInt x)))

(defn bigint?
  "Checks if the passed value is a BigInt instance."
  [x]
  #?(:clj (instance? clojure.lang.BigInt x)
     :cljs (= (type x) js/BigInt)))

(defn integer?
  "Checks if the passed value is an integer. [[clojure.core/integer?]] does not take BigInt into account on CLJS."
  [x]
  #?(:clj (core/integer? x)
     :cljs (core/or (core/integer? x) (bigint? x))))

(defn parse-bigint
  "Parses a string as a BigInt. If the string cannot be parsed, returns `nil`."
  [s]
  (when (re-matches #"[+-]?\d+" s)
    (bigint s)))
