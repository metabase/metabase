(ns metabase.lib.drill-thru.progression
  "Logic for when it's possible to \"drill down\" into some breakout on a query, seeing it at a finer level of detail."
  (:require
   [medley.core :as m]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.types.isa :as lib.types.isa]))

;; XXX: This file probably needs to be completely rewritten.

(defn- field-columns-by-name [query stage-number dimensions]
  (let [by-name (m/index-by :name (lib.metadata.calculation/visible-columns query stage-number query))]
    (for [{:keys [column-name]} dimensions
          :let [column (get by-name column-name)]
          :when (and column (not= (:lib/source column) :source/expressions))]
      column)))

(def ^:private drill-down-progressions
  [;; DateTime drill down
   {:predicates [#(some-> % :unit #{:year :quarter :month :week :day :hour})]
    :zoom-in    #(lib.options/update-options update :unit {:year    :quarter
                                                           :quarter :month
                                                           :month   :week
                                                           :week    :day
                                                           :day     :hour
                                                           :hour    :minute})}
   ;; Country => State (=> City)
   {:predicates [lib.types.isa/country?]
    :zoom-in    nil}])

(defn- progression-matches?
  "Returns the `:zoom-in` function of a progression if all its `:predicates` pass."
  [{:keys [predicates zoom-in]} columns]
  (when (every? #(some % columns) predicates)
    zoom-in))

(defn- matching-progression
  "A progression applies to a query and dimensions if for each function in `:predicates` there exists some column that
  satisfies it. (The columns may be different for each predicate, there just needs to be some column that passes each.)"
  [_query _stage-number columns]
  (some #(progression-matches? % columns) drill-down-progressions))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- next-breakouts [query stage-number dimensions]
  (when-let [columns (not-empty (field-columns-by-name query stage-number dimensions))]
    (when-let [progression (matching-progression query stage-number columns)]
      progression)))
