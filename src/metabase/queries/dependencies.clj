(ns metabase.queries.dependencies
  "The functions of the dependencies spec of a Card."
  (:require
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.visualization-settings.dynamic-goals :as dynamic-goals]))

(set! *warn-on-reflection* true)

(defn- card-query
  "The normalized query of `card`."
  [card]
  (lib-be/normalize-query (:dataset_query card)))

(defn hydrate
  "The Cards `cards` with the dependencies of their native queries."
  [cards]
  (dependencies/with-native-dependencies cards card-query))

(defn analysis
  "The errors of the query of `card`."
  [card]
  (dependencies/query-errors (card-query card)))

(defn goal-dependencies
  "The entities the dynamic goals in stored `viz-settings` read."
  [viz-settings]
  (dynamic-goals/goal-dependencies
   (some->> viz-settings (lib/normalize ::lib.schema.visualization/visualization-settings))))

(defn dependencies
  "The dependencies of the hydrated `card`: what its query reads, the tables of its dimension mappings, the cards its
  parameters take their values from, and the entities its dynamic goals read."
  [{dimension-mappings :dimension_mappings, :keys [parameters visualization_settings], :as card}]
  (dependencies/merge-dependencies
   (dependencies/query-dependencies card (card-query card))
   {:table (into #{} (keep :table-id) dimension-mappings)}
   (dependencies/parameters-dependencies parameters)
   (goal-dependencies visualization_settings)))
