(ns metabase.util.number.impl
  "CLJ implementation of the number utilities.
  See [[metabase.util.number]] for the public interface."
  (:refer-clojure :exclude [bigint])
  (:require
   [clojure.core :as core]))

(defn bigint
  "Coerce a number or a string to BigInt. Throws if coercion cannot be made."
  [x]
  (core/bigint x))

(defn bigint?
  "Checks if the passed value is a BigInt instance."
  [x]
  (instance? clojure.lang.BigInt x))
