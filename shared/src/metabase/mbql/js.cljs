(ns metabase.mbql.js
  "JavaScript-friendly interface to metabase.mbql util functions."
  (:require [metabase.mbql.normalize :as normalize]))

(defn ^:export normalize
  "Normalize an MBQL query, and convert it to the latest and greatest version of MBQL."
  [query]
  (-> query js->clj normalize/normalize clj->js))
