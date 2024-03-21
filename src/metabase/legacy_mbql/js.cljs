(ns metabase.legacy-mbql.js
  "JavaScript-friendly interface to metabase.legacy-mbql util functions."
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.util :as u]))

(defn- unwrap
  "Sometimes JS queries are passed in with a `Join` or `Aggregation` clause object instead of a simple Array.
  These clauses `extend Array` so `Array.isArray(x)` is true, but they're treated as opaque by `js->clj`.
  This recurses over the whole query, unwrapping these values to their `.raw()` form."
  [x]
  (cond
    ;; (object? x) only matches for things that are plain objects. eg. `(object? (js/Date.))` is false.
    ;; This matches anything that descends from `Object`, like `Join` clause, and has a `.raw()` method.
    (and x
         (instance? js/Object x)
         (fn? (.-raw x)))        (-> x (.raw) js->clj unwrap)
    (map? x)                     (update-vals x unwrap)
    (sequential? x)              (mapv unwrap x)
    :else                        x))

(defn normalize-cljs
  "Normalize an MBQL query, and convert it to the latest and greatest version of MBQL.

  Returns the CLJS form of the normalized query. Use [[normalize]] for the JS form."
  [query]
  (-> query js->clj unwrap mbql.normalize/normalize))

(defn ^:export normalize
  "Normalize an MBQL query, and convert it to the latest and greatest version of MBQL.

  Returns the JS form of the normalized query. Use [[normalize-cljs]] for the CLJS form."
  [query]
  (-> query normalize-cljs (clj->js :keyword-fn u/qualified-name)))
