(ns metabase.lib.card
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
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

(defmethod lib.metadata.calculation/visible-columns-method :metadata/card
  [query
   stage-number
   {:keys [fields result-metadata] :as card-metadata}
   {:keys [include-implicitly-joinable? unique-name-fn] :as options}]
  (concat
    (lib.metadata.calculation/returned-columns query stage-number card-metadata options)
    (when include-implicitly-joinable?
      (lib.metadata.calculation/implicitly-joinable-columns
        query stage-number (concat fields result-metadata) unique-name-fn))))

(mu/defn fallback-display-name :- ::lib.schema.common/non-blank-string
  "If for some reason the metadata is unavailable. This is better than returning nothing I guess."
  [card-id :- ::lib.schema.id/card]
  (i18n/tru "Question {0}" (pr-str card-id)))

(defmethod lib.metadata.calculation/describe-top-level-key-method :source-card
  [query stage-number _k]
  (let [{:keys [source-card]} (lib.util/query-stage query stage-number)]
    (when source-card
      (or (when-let [card-metadata (lib.metadata/card query source-card)]
            (lib.metadata.calculation/display-name query stage-number card-metadata :long))
          (fallback-display-name source-card)))))

(mu/defn ^:private infer-returned-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [metadata-providerable :- lib.metadata/MetadataProviderable
   card-query            :- :map]
  (when (some? card-query)
    (lib.metadata.calculation/returned-columns (lib.query/query metadata-providerable (lib.convert/->pMBQL card-query)))))

(def ^:private Card
  [:map
   {:error/message "Card with :dataset-query"}
   [:dataset-query :map]])

(def ^:dynamic *force-broken-card-refs*
  "Things are fundamentally broken because of #29763, and every time I try to fix this is ends up being a giant mess to
  untangle. The FE currently ignores results metadata for ad-hoc queries, and thus cannot match up 'correct' Field
  refs like 'Products__CATEGORY'... for the time being we'll have to force ID refs even when we should be using
  nominal refs so as to not completely destroy the FE. Once we port more stuff over maybe we can fix this."
  true)

(mu/defn ->card-metadata-column :- lib.metadata/ColumnMetadata
  "Massage possibly-legacy Card results metadata into MLv2 ColumnMetadata."
  ([metadata-providerable col]
   (->card-metadata-column metadata-providerable nil col))

  ([metadata-providerable :- lib.metadata/MetadataProviderable
    card-or-id            :- [:maybe [:or ::lib.schema.id/card lib.metadata/CardMetadata]]
    col                   :- :map]
   (let [col (-> col
                 (update-keys u/->kebab-case-en)
                 ;; ignore `:field-ref`, it's very likely a legacy field ref, and it's probably wrong either way. We
                 ;; can always calculate a new one.
                 (dissoc :field-ref))]
     (merge
      {:base-type :type/*, :lib/type :metadata/column}
      (when-let [field-id (:id col)]
        (try
          (lib.metadata/field metadata-providerable field-id)
          (catch #?(:clj Throwable :cljs :default) _
            nil)))
      col
      {:lib/type                :metadata/column
       :lib/source              :source/card
       :lib/source-column-alias ((some-fn :lib/source-column-alias :name) col)}
      (when card-or-id
        {:lib/card-id (u/the-id card-or-id)})
      (when *force-broken-card-refs*
        {::force-broken-id-refs true}
        #_(when-let [legacy-join-alias (:source-alias col)]
            {:lib/desired-column-alias (lib.util/format "%s__%s" legacy-join-alias (:name col))}))))))

(def ^:private CardColumnMetadata
  [:merge
   lib.metadata/ColumnMetadata
   [:map
    [:lib/source [:= :source/card]]]])

(def ^:private CardColumns
  [:maybe [:sequential {:min 1} CardColumnMetadata]])

(mu/defn ^:private card-metadata-columns :- CardColumns
  [metadata-providerable :- lib.metadata/MetadataProviderable
   card                  :- Card]
  (when-let [result-metadata (or (:fields card)
                                 (:result-metadata card)
                                 (infer-returned-columns metadata-providerable (:dataset-query card)))]
    ;; Card `result-metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
    ;; contains` :columns` as well.
    (when-let [cols (not-empty (cond
                                 (map? result-metadata)        (:columns result-metadata)
                                 (sequential? result-metadata) result-metadata))]
      (mapv (partial ->card-metadata-column metadata-providerable card)
            cols))))

(mu/defn saved-question-metadata :- CardColumns
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
          (let [desired-alias ((some-fn :lib/desired-column-alias :lib/source-column-alias :name) col)]
            (assoc col :lib/desired-column-alias (unique-name-fn desired-alias))))
        (card-metadata-columns query card)))
