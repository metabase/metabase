(ns metabase.lib.card
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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

(defmethod lib.metadata.calculation/display-info-method :metadata/card
  [query stage-number card-metadata]
  (cond-> ((get-method lib.metadata.calculation/display-info-method :default) query stage-number card-metadata)
    (= (:type card-metadata) :question) (assoc :question? true)
    (= (:type card-metadata) :model) (assoc :model? true)
    (= (:type card-metadata) :metric) (assoc :metric? true)))

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

(mu/defn- infer-returned-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-query            :- :map]
  (when (some? card-query)
    (lib.metadata.calculation/returned-columns (lib.query/query metadata-providerable card-query))))

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

(defn- ->card-metadata-column
  "Massage possibly-legacy Card results metadata into MLv2 ColumnMetadata. Note that `card` might be unavailable so we
  accept both `card-id` and `card`."
  [col
   card-id
   card
   field]
   (let [col (-> col
                 (update-keys u/->kebab-case-en))]
     (cond-> (merge
              {:base-type :type/*, :lib/type :metadata/column}
              field
              col
              {:lib/type                :metadata/column
               :lib/source              :source/card
               :lib/source-column-alias ((some-fn :lib/source-column-alias :name) col)})
       card-id
       (assoc :lib/card-id card-id)

       (and *force-broken-card-refs*
            ;; never force broken refs for Models, because Models can have give columns with completely
            ;; different names the Field ID of a different column, somehow. See #22715
            (or
             ;; we can only do this check if `card-id` is passed in.
             (not card-id)
             (not= (:type card) :model)))
       (assoc ::force-broken-id-refs true)

       ;; If the incoming col doesn't have `:semantic-type :type/FK`, drop `:fk-target-field-id`.
       ;; This comes up with metadata on SQL cards, which might be linked to their original DB field but should not be
       ;; treated as FKs unless the metadata is configured accordingly.
       (not= (:semantic-type col) :type/FK)
       (assoc :fk-target-field-id nil))))

(mu/defn ->card-metadata-columns :- [:sequential ::lib.schema.metadata/column]
  "Massage possibly-legacy Card results metadata into MLv2 ColumnMetadata."
  ([metadata-providerable cols]
   (->card-metadata-columns metadata-providerable nil cols))

  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    card-or-id            :- [:maybe [:or ::lib.schema.id/card ::lib.schema.metadata/card]]
    cols                  :- [:sequential :map]]
   (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
         card-id           (when card-or-id (u/the-id card-or-id))
         card              (when card-id (lib.metadata/card metadata-providerable card-id))
         field-ids         (keep :id cols)
         fields            (lib.metadata.protocols/metadatas metadata-provider :metadata/column field-ids)
         field-id->field   (m/index-by :id fields)]
     (mapv #(->card-metadata-column % card-id card (get field-id->field (:id %))) cols))))

(def ^:private CardColumnMetadata
  [:merge
   ::lib.schema.metadata/column
   [:map
    [:lib/source [:= :source/card]]]])

(def ^:private CardColumns
  [:maybe [:sequential {:min 1} CardColumnMetadata]])

(def ^:private ^:dynamic *card-metadata-columns-card-ids*
  "Used to track the ID of Cards we're resolving columns for, to avoid inifinte recursion for Cards that have circular
  references between one another."
  #{})

(mu/defn card-metadata-columns :- CardColumns
  "Get a normalized version of the saved metadata associated with Card metadata."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- Card]
  (when-not (contains? *card-metadata-columns-card-ids* (:id card))
    (binding [*card-metadata-columns-card-ids* (conj *card-metadata-columns-card-ids* (:id card))]
      (when-let [result-metadata (or (:fields card)
                                     (:result-metadata card)
                                     (infer-returned-columns metadata-providerable (:dataset-query card)))]
        ;; Card `result-metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
        ;; contains` :columns` as well.
        (when-let [cols (not-empty (cond
                                     (map? result-metadata)        (:columns result-metadata)
                                     (sequential? result-metadata) result-metadata))]
          (->card-metadata-columns metadata-providerable card cols))))))

(mu/defn saved-question-metadata :- CardColumns
  "Metadata associated with a Saved Question with `card-id`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id               :- ::lib.schema.id/card]
  ;; it seems like in some cases (unit tests) the FE is renaming `:result-metadata` to `:fields`, not 100% sure why
  ;; but handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card metadata-providerable card-id)]
    (card-metadata-columns metadata-providerable card)))

(defmethod lib.metadata.calculation/returned-columns-method :metadata/card
  [query _stage-number card {:keys [unique-name-fn], :as options}]
  (mapv (fn [col]
          (let [desired-alias ((some-fn :lib/desired-column-alias :lib/source-column-alias :name) col)]
            (assoc col :lib/desired-column-alias (unique-name-fn desired-alias))))
        (if (= (:type card) :metric)
          (let [metric-query (-> card :dataset-query mbql.normalize/normalize lib.convert/->pMBQL
                                 (lib.util/update-query-stage -1 dissoc :aggregation :breakout))]
            (not-empty (lib.metadata.calculation/returned-columns
                        (assoc metric-query :lib/metadata (:lib/metadata query))
                        -1
                        (lib.util/query-stage metric-query -1)
                        options)))
          (card-metadata-columns query card))))
