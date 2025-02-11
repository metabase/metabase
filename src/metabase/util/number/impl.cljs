(ns metabase.util.number.impl
  "CLJS implementation of the number utilities.
  See [[metabase.util.number]] for the public interface.")

(defn bigint
  "Coerce a number or a string to BigInt. Throws if coercion cannot be made."
  [x]
  (js/BigInt x))

(defn bigint?
  "Checks if the passed value is a BigInt instance."
  [x]
  (instance? js/BigInt x))
