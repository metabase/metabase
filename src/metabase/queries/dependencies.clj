(ns metabase.queries.dependencies
  "The functions of the dependencies spec of a Card."
  (:require
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]))

(set! *warn-on-reflection* true)

(defn- card-query
  "The normalized query of `card`."
  [card]
  (lib-be/normalize-query (:dataset_query card)))

(defn hydrate
  "The Cards `cards` with the dependencies of their native queries."
  [cards]
  (dependencies/with-native-dependencies cards card-query))

(defn dependencies
  "The dependencies of the hydrated `card`: what its query reads, the tables of its dimension mappings, and the cards
  its parameters take their values from."
  [{dimension-mappings :dimension_mappings, :keys [parameters], :as card}]
  (dependencies/merge-dependencies
   (dependencies/query-dependencies card (card-query card))
   {:table (into #{} (keep :table-id) dimension-mappings)}
   (dependencies/parameters-dependencies parameters)))
