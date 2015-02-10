(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require [medley.core :refer :all]))

(defn select-non-nil-keys
  "Like `select-keys` but filters out key-value pairs whose value is nil."
  [m & keys]
  (->> (select-keys m keys)
       (filter-vals identity)))

(defn apply-kwargs
  "Like `apply`, but takes a map as the last argument, and applies its key-value pairs as keyword args.

  `(apply-kwargs assoc {} {:c 3 :d 4}) -> (apply assoc {} :c 3 :d 4)`"
  [fn & args]
  (apply fn (concat (butlast args) (->> (last args)
                                        (apply vector)
                                        (reduce concat)))))
