(ns metabase.lib.card
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/display-name-method :metadata/card
  [_query _stage-number card-metadata _style]
  ((some-fn :display-name :name) card-metadata))

(defmethod lib.metadata.calculation/metadata-method :metadata/card
  [_query _stage-number {card-name :name, :keys [display-name], :as card-metadata}]
  (cond-> card-metadata
    (not display-name) (assoc :display-name (u.humanization/name->human-readable-name :simple card-name))))

(defmethod lib.metadata.calculation/describe-top-level-key-method :source-card
  [query stage-number _k]
  (let [{:keys [source-card]} (lib.util/query-stage query stage-number)]
    (when source-card
      (or (when-let [card-metadata (lib.metadata/card query source-card)]
            (lib.metadata.calculation/display-name query stage-number card-metadata :long))
          ;; If for some reason the metadata is unavailable. This is better than returning nothing I guess
          (i18n/tru "Saved Question {0}" (pr-str source-card))))))

(mu/defn ^:private infer-returned-columns
  [metadata-providerable :- lib.metadata/MetadataProviderable
   card-query            :- :map]
  (when (some? card-query)
    (lib.metadata.calculation/returned-columns (lib.query/query metadata-providerable (lib.convert/->pMBQL card-query)))))

(def ^:private Card
  [:map
   {:error/message "Card with :dataset-query"}
   [:dataset-query :map]])

(mu/defn ^:private card-metadata-columns
  [metadata-providerable :- lib.metadata/MetadataProviderable
   card                  :- Card]
  (when-let [result-metadata (or (:result-metadata card)
                                 (:fields card)
                                 (infer-returned-columns metadata-providerable (:dataset-query card)))]
    ;; Card `result-metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
    ;; contains` :columns` as well.
    (when-let [cols (not-empty (cond
                                 (map? result-metadata)        (:columns result-metadata)
                                 (sequential? result-metadata) result-metadata))]
      (mapv (fn [col]
              (merge
               {:base-type :type/*, :lib/type :metadata/column}
               (when-let [field-id (:id col)]
                 (try
                   (lib.metadata/field metadata-providerable field-id)
                   (catch #?(:clj Throwable :cljs :default) _
                     nil)))
               (update-keys col u/->kebab-case-en)
               {:lib/type                :metadata/column
                :lib/source              :source/card
                :lib/card-id             (:id card)
                :lib/source-column-alias (:name col)}))
            cols))))

(mu/defn saved-question-metadata :- [:maybe [:sequential {:min 1} lib.metadata.calculation/ColumnMetadataWithSource]]
  "Metadata associated with a Saved Question with `card-id`."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   card-id               :- ::lib.schema.id/card]
  ;; it seems like in some cases (unit tests) the FE is renaming `:result-metadata` to `:fields`, not 100% sure why
  ;; but handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card metadata-providerable card-id)]
    (card-metadata-columns metadata-providerable card)))

(defmethod lib.metadata.calculation/returned-columns-method :metadata/card
  [query _stage-number card {:keys [unique-name-fn], :as _options}]
  (mapv (fn [col]
          (assoc col :lib/desired-column-alias (unique-name-fn (:name col))))
        (card-metadata-columns query card)))
