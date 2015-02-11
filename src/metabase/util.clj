(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [medley.core :refer :all]))

(defn select-non-nil-keys
  "Like `select-keys` but filters out key-value pairs whose value is nil."
  [m & keys]
  (->> (select-keys m keys)
       (filter-vals identity)))

;; looking for `apply-kwargs`?
;; turns out `medley.core/mapply` does the same thingx
