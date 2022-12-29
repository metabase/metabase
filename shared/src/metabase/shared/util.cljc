(ns metabase.shared.util
  (:require
   [camel-snake-kebab.core :as csk]
   [medley.core :as m]))

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

(defn remove-nils
  "Given a map, returns a new map with all nil values removed."
  [m]
  (m/filter-vals some? m))

(defn normalize-map
  "Given any map-like object, return it as a Clojure map with :kebab-case keyword keys.
  The input map can be a:
  - Clojure map with string or keyword keys,
  - JS object (with string keys)
  The keys are converted to `kebab-case` from `camelCase` or `snake_case` as necessary, and turned into keywords.
  Namespaces keywords are rejected with an exception.

  Returns an empty map if nil is input (like [[update-keys]])."
  [m]
  (let [base #?(:clj  m
                ;; If we're running in CLJS, convert to a ClojureScript map as needed.
                :cljs (if (object? m)
                        (js->clj m)
                        m))]
    (update-keys base csk/->kebab-case-keyword)))
