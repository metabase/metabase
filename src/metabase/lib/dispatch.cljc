(ns metabase.lib.dispatch
  (:require [metabase.util :as u]))

(defn- mbql-clause-type [x]
  (when (and (vector? x)
             (keyword? (first x)))
    (first x)))

(defn dispatch-value
  "Dispatch value for a clause, map, or other object. Dispatch rules are as follows:

  1. If it is an MBQL clause (vector with a keyword as its first argument), dispatch on that clause keyword

  2. If it is a map with a `:lib/type` key, dispatch on that;

  3. Otherwise, dispatch on a keyword representing the class of the object, e.g. `:dispatch-type/string` for a String.
     The main reason this returns weird keywords like this rather than class names like `String` is to make it easier to
     write cross-compatible code. See [[u/dispatch-type-keyword]] for more info."
  [x]
  ;; TODO -- for Clj, we should probably handle Toucan instances as well, and dispatch off
  ;; of [[toucan2.core/model]]?
  (or (mbql-clause-type x)
      (when (map? x)
        (:lib/type x))
      (u/dispatch-type-keyword x)))
