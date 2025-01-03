(ns metabase.lib.ident
  "Helpers for `:ident`s."
  (:require
   [metabase.util :as u]))

(defn random-ident
  "Generates a new, randomized, globally unique `:ident` - an opaque string."
  []
  (u/generate-nano-id))

(defn keyed-idents
  "Replaces all the values in the given map with [[random-ident]]s, using the original keys."
  [m]
  (when (seq m)
    (update-vals m (fn [_] (random-ident)))))

(defn indexed-idents
  "Given a `seq` or a count, generates a [[random-ident]] for each one. Returns a map of indexes to idents."
  [xs-or-number]
  (let [lhs (if (number? xs-or-number)
              (range xs-or-number)
              (range (count xs-or-number)))]
    (not-empty (zipmap lhs (repeatedly random-ident)))))
