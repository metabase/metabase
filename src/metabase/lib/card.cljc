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

(defmethod lib.metadata.calculation/display-name-method :metadata/card
  [_query _stage-number card-metadata _style]
  ((some-fn :display_name :name) card-metadata))

(defmethod lib.metadata.calculation/metadata-method :metadata/card
  [_query _stage-number {card-name :name, display-name :display_name, :as card-metadata}]
  (cond-> card-metadata
    (not display-name) (assoc :display_name (u.humanization/name->human-readable-name :simple card-name))))

(defn- infer-results-metadata [metadata-provider card-query]
  (lib.metadata.calculation/metadata (lib.query/query metadata-provider (lib.convert/->pMBQL card-query))))

(defn- card-metadata-columns
  [query card]
  (when-let [result-metadata (or (:result_metadata card)
                                 (:fields card)
                                 (infer-results-metadata (:lib/metadata query) (:dataset_query card)))]
    ;; Card `result_metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
    ;; contains` :columns` as well.
    (when-let [cols (not-empty (cond
                                 (map? result-metadata)        (:columns result-metadata)
                                 (sequential? result-metadata) result-metadata))]
      (mapv (fn [col]
              (merge
               (when-let [field-id (:id col)]
                 (lib.metadata/field query field-id))
               col
               {:lib/type                :metadata/field
                :lib/source              :source/card
                :lib/card-id             (:id card)
                :lib/source-column-alias (:name col)}))
            cols))))

(mu/defn saved-question-metadata :- [:maybe [:sequential {:min 1} lib.metadata.calculation/ColumnMetadataWithSource]]
  "Metadata associated with a Saved Question with `card-id`."
  [query   :- ::lib.schema/query
   card-id :- ::lib.schema.id/card]
  ;; it seems like in some cases (unit tests) the FE is renaming `:result_metadata` to `:fields`, not 100% sure why
  ;; but handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card query card-id)]
    (card-metadata-columns query card)))

(defmethod lib.metadata.calculation/default-columns-method :metadata/card
  [query _stage-number card unique-name-fn]
  (mapv (fn [col]
          (assoc col :lib/desired-column-alias (unique-name-fn (:name col))))
        (card-metadata-columns query card)))
