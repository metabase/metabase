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
    (nil? x)     :type/nil
    (string? x)  :type/string
    (integer? x) :type/integer
    (number? x)  :type/number
    (map? x)     :type/map
    :else        (type x)))

(defn dispatch-value
  [x]
  (or (mbql-clause-type x)
      ;; TODO -- for Clj, we should probably handle Toucan instances as well, and dispatch off
      ;; of [[toucan2.core/model]]?
      (cljc-friendly-type-keyword x)))
