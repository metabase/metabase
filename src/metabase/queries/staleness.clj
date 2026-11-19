(ns metabase.queries.staleness
  "How the stale content page loads and shows the Cards that are stale."
  (:require
   [metabase.collections.core :as collections]
   [metabase.lib.core :as lib]
   [metabase.queries.db :as queries.db]))

(set! *warn-on-reflection* true)

(defn load-items
  "The rows of the Cards with `card-ids`, loaded for [[render]] with the ancestors of their collections."
  [card-ids]
  (collections/with-effective-ancestors (queries.db/stale-card-items card-ids)))

(defn render
  "The API item of the loaded Card row `card`."
  [{:keys [dataset_query type] :as card}]
  (-> card
      (assoc :fully_parameterized (or (empty? dataset_query) (lib/fully-parameterized-query? dataset_query))
             :model               (if (= (keyword type) :model) "dataset" "card"))
      (dissoc :dataset_query :type :result_metadata :dimensions :dimension_mappings)
      collections/present-collection))
