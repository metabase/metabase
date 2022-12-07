(ns metabase.shared.util
  (:require [medley.core :as m]
            #?@(:cljs [[clojure.string :as str]])))

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

#?(:cljs
   (defn ^:export kebab-keys
     "Given a JS object with JS-style \"snake_case\" string keys, return a Clojure map with :kebab-case keyword keys."
     [js-obj]
     (-> js-obj
         js->clj
         (update-keys #(keyword (str/replace % #"_" "-"))))))
