(ns metabase-enterprise.replacement.parameters
  (:require
   [medley.core :as m]))

(defn parameter-mappings->card-ids
  [mappings]
  (keep :card_id mappings))

(defn update-parameter-mappings
  [mappings card-id->query update-fn]
  (mapv (fn [mapping]
          (or (when-let [query (get card-id->query (:card_id mapping))]
                (m/update-existing mapping :target #(update-fn query %)))
              mapping))
        mappings))
