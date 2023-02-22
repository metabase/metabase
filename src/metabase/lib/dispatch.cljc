(ns metabase.lib.dispatch)

(defn dispatch-value
  [x]
  (cond
    ;; TODO -- support namespaced keywords?
    (and (vector? x)
         ((some-fn keyword? string?) (first x)))
    (keyword "mbql" (name (first x)))

    (and (map? x)
         (:type x))
    (:type x)

    (nil? x)
    :type/nil

    (string? x)
    :type/string

    (integer? x)
    :type/integer

    (number? x)
    :type/number

    :else
    (type x)))
