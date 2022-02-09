(ns metabase.shared.util)

(defn qualified-name
  "Return `k` as a string, qualified by its namespace, if any (unlike `name`). Handles `nil` values gracefully as well
  (also unlike `name`).

     (u/qualified-name :type/FK) -> \"type/FK\""
  [k]
  (when (some? k)
    (if-let [namespac (when #?(:clj (instance? clojure.lang.Named k)
                               :cljs (keyword? k))
                        (namespace k))]
      (str namespac "/" (name k))
      (name k))))
