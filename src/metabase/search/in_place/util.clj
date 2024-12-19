<<<<<<<< HEAD:src/metabase/search/in_place/util.clj
(ns metabase.search.in-place.util
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))
========
(ns metabase.search.util)
>>>>>>>> origin:src/metabase/search/util.clj

(defn impossible-condition?
  "An (incomplete) check where queries will definitely return nothing, to help avoid spurious index update queries."
  [where]
  (when (vector? where)
    (case (first where)
      :=   (let [[a b] (rest where)]
             (and (string? a) (string? b) (not= a b)))
      :!=  (let [[a b] (rest where)]
             (and (string? a) (string? b) (= a b)))
      :and (boolean (some impossible-condition? (rest where)))
      :or  (every? impossible-condition? (rest where))
      false)))
