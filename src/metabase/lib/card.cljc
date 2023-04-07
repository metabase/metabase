(ns metabase.lib.card
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

(defn- infer-results-metadata [metadata-provider card-query]
  (lib.metadata.calculation/metadata (lib.query/query metadata-provider (lib.convert/->pMBQL card-query))))

(mu/defn saved-question-metadata :- [:maybe [:sequential {:min 1} lib.metadata.calculation/ColumnMetadataWithSource]]
  "Metadata associated with a Saved Question with `card-id`."
  [query   :- ::lib.schema/query
   card-id :- ::lib.schema.id/card]
  ;; it seems like in some cases the FE is renaming `:result_metadata` to `:fields`, not 100% sure why but
  ;; handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card query card-id)]
    (when-let [result-metadata (or ((some-fn :result_metadata :fields) card)
                                   (infer-results-metadata (:lib/metadata query) (:dataset_query card)))]
      (when-let [cols (not-empty (cond
                                   (map? result-metadata)        (:columns result-metadata)
                                   (sequential? result-metadata) result-metadata))]
        (mapv (fn [col]
                (assoc col
                       :lib/type                :metadata/field
                       :lib/source              :source/card
                       :lib/source-column-alias (:name col)))
              cols)))))

(defmethod lib.metadata.calculation/metadata-method :metadata/card
  [_query _stage-number {card-name :name, display-name :display_name, :as card-metadata}]
  (cond-> card-metadata
    (not display-name) (assoc :display_name (u.humanization/name->human-readable-name :simple card-name))))
