(ns metabase.shared.util
  (:require
    [clojure.string :as str]
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

(defn normalize-key
  "Given a string or keyword, in snake_case or kebab-case, normalize it to a :kebab-case keyword.

  If the input is a namespaced keyword, the namespace is untouched but the base name is converted."
  [k]
  (keyword (when (keyword? k) (namespace k))
           (-> k name (#(str/replace % #"_" "-")))))

(defn normalize-map
  "Given any map-like object, return it as a Clojure map with :kebab-case keyword keys.
  The input map can be a:
  - Clojure map with string or keyword keys,
  - JS object (with string keys)
  The keys are converted to kebab-case from snake_case as necessary, and turned into keywords.

  Returns an empty map if nil is input (like [[update-keys]]).

  Note that namespaces on keys are dropped (see [[normalize-key]]). Since this is intended for accepting JSON options
  maps and things like that, we don't expect inputs to include namespaced keys."
  [m]
  (let [base #?(:clj  m
                ;; If we're running in CLJS, convert to a ClojureScript map as needed.
                :cljs (if (object? m)
                        (js->clj m)
                        m))]
    (update-keys base normalize-key)))
