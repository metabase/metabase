(ns metabase.lib.dispatch
  (:require [metabase.util :as u]))

(defn- mbql-clause-type [x]
  (when (and (vector? x)
             (keyword? (first x)))
    (if (and (map? (second x))
             (:lib/aggregation-options (second x)))
      :mbql/aggregation-options
      (first x))))

(defn dispatch-value
  "Dispatch value for a clause, map, or other object. Dispatch rules are as follows:

  1. If it is an MBQL clause (vector with a keyword as its first argument), dispatch on:
    a. if the `:lib/aggregation-options` option is set, dispatch on `:mbql/aggregation-options`.
    b. otherwise, dispatch on the first argument (eg. `:field`, `:count`)

  2. If it is a map with a `:lib/type` key, dispatch on that;

  3. Otherwise, dispatch on a keyword representing the class of the object, e.g. `:dispatch-type/string` for a String.
     The main reason this returns weird keywords like this rather than class names like `String` is to make it easier to
     write cross-compatible code. See [[u/dispatch-type-keyword]] for more info."
  [x]
  ;; TODO -- for Clj, we should probably handle Toucan instances as well, and dispatch off
  ;; of [[toucan2.core/model]]?
  (or (mbql-clause-type x)
      (when (map? x)
        (if (and (or (keyword? (:operator x))
                     (string? (:operator x)))
                 (vector? (:args x))
                 (map? (:options x {})))
          :lib/external-op
          (:lib/type x)))
      (u/dispatch-type-keyword x)))
