(ns metabase.lib.dispatch)

(defn- mbql-clause-type [x]
  (when (and (vector? x)
             (keyword? (first x)))
    (keyword (first x))))

(defn- cljc-friendly-type-keyword
  "This should probably just be `type`, but these keys are here for now until I figure out how to do this in a
  cljc-friendly way. e.g. I don't know what `(type \"x\") is in Cljs."
  [x]
  (cond
    (map? x)     (or (:lib/type x)
                     :type/map)
    (map? x)     :type/map
    (nil? x)     :type/nil
    (string? x)  :type/string
    (integer? x) :type/integer
    (number? x)  :type/number
    ;; we should add more mappings here as needed
    :else        (type x)))

(defn dispatch-value
  "Dispatch value for a clause, map, or other object. Dispatch rules are as follows:

  1. If it is an MBQL clause (vector with a keyword as its first argument), dispatch on that clause keyword

  2. If it is a map with a `:lib/type` key, dispatch on that;

  3. Otherwise, dispatch on a keyword representing the class of the object, e.g. `:type/string` for a String. The main
     reason this returns weird keywords like this rather than class names like `String` is to make it easier to write
     cross-compatible code. There's probably a better way to do this but I'm not even sure what the `String` class is in
     Cljs. Changes welcome"
  [x]
  (or (mbql-clause-type x)
      ;; TODO -- for Clj, we should probably handle Toucan instances as well, and dispatch off
      ;; of [[toucan2.core/model]]?
      (cljc-friendly-type-keyword x)))
