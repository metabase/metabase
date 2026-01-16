(ns metabase.lib.card
  (:refer-clojure :exclude [mapv select-keys empty? not-empty])
  (:require
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [mapv select-keys empty? not-empty]]))

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
    (= (:type card-metadata) :metric) (assoc :metric? true)
    (= (lib.util/source-card-id query) (:id card-metadata)) (assoc :is-source-card true)))

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
  [metadata-providerable                 :- ::lib.schema.metadata/metadata-providerable
   {card-query :dataset-query :as _card} :- ::lib.schema.metadata/card]
  (when (seq card-query)
    (lib.metadata.calculation/returned-columns (lib.query/query metadata-providerable card-query))))

(mu/defn- ->card-metadata-column :- ::lib.schema.metadata/column
  "Massage possibly-legacy Card results metadata into MLv2 ColumnMetadata. Note that `card` might be unavailable so we
  accept both `card-id` and `card`.

  * `source-metadata-col` = (possibly snake_cased) column metadata from Card `:source-metadata`
  * `field-metadata`      = Field metadata (`:metadata/column`) from the metadata provider for the Field with ID"
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   source-metadata-col   :- :map
   card-id               :- [:maybe ::lib.schema.id/card]
   field-metadata        :- [:maybe ::lib.schema.metadata/column]]
  (let [source-metadata-col (-> source-metadata-col
                                (perf/update-keys u/->kebab-case-en))
        ;; use the (possibly user-specified) display name as the "original display name" going forward ONLY IF THE
        ;; CARD THIS CAME FROM WAS A MODEL! BUT DON'T USE IT IF IT ALREADY CONTAINS A `→`!!!
        source-metadata-col (cond-> source-metadata-col
                              (and (:display-name source-metadata-col)
                                   ;; TODO (Cam 6/23/25) -- a little silly to fetch this Card like 100 times, maybe we
                                   ;; should just change this function to take `card` instead.
                                   (when card-id
                                     (when-some [card (lib.metadata/card metadata-providerable card-id)]
                                       (= (:type card) :model))))
                              (assoc :lib/model-display-name (:display-name source-metadata-col)))
        col (merge
             {:base-type :type/*, :lib/type :metadata/column}
             field-metadata
             (m/filter-vals some? source-metadata-col)
             {:lib/type                :metadata/column
              :lib/source-column-alias ((some-fn :lib/source-column-alias :name) source-metadata-col)})
        col (cond-> col
              (:metabase.lib.field/temporal-unit source-metadata-col)
              (assoc :inherited-temporal-unit (keyword (:metabase.lib.field/temporal-unit source-metadata-col)))

              ;; If the incoming source-metadata-col doesn't have `:semantic-type :type/FK`, drop
              ;; `:fk-target-field-id`. This comes up with metadata on SQL cards, which might be linked to their
              ;; original DB field but should not be treated as FKs unless the metadata is configured
              ;; accordingly.
              (not= (:semantic-type source-metadata-col) :type/FK)
              (assoc :fk-target-field-id nil))]
    (-> col
        lib.field.util/update-keys-for-col-from-previous-stage
        (merge (when card-id
                 {:lib/source :source/card, :lib/card-id card-id}))
        ;; :effective-type is required, but not always set, see e.g.,
        ;; [[metabase.warehouse-schema-rest.api.table/card-result-metadata->virtual-fields]]
        (u/assoc-default :effective-type (:base-type col))
        ;; add original display name IF not already present AND we have a value
        (->> (lib.normalize/normalize ::lib.schema.metadata/column)))))

(mu/defn ->card-metadata-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Massage possibly-legacy Card results metadata into MLv2 ColumnMetadata."
  ([metadata-providerable cols]
   (->card-metadata-columns metadata-providerable nil cols))

  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    card-or-id-or-nil     :- [:maybe [:or ::lib.schema.id/card ::lib.schema.metadata/card]]
    cols                  :- [:maybe [:or
                                      [:sequential ::lib.schema.metadata/lib-or-legacy-column]
                                      [:map
                                       [:columns [:sequential ::lib.schema.metadata/lib-or-legacy-column]]]]]]
   ;; Card `result-metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
   ;; contains` :columns` as well.
   (when-let [cols (not-empty (cond
                                (map? cols)        (:columns cols)
                                (sequential? cols) cols))]
     (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
           card-id           (when card-or-id-or-nil (u/the-id card-or-id-or-nil))
           field-ids         (not-empty (into #{} (keep :id) cols))
           fields            (when field-ids
                               (lib.metadata.protocols/metadatas metadata-provider {:lib/type :metadata/column, :id field-ids}))
           field-id->field   (m/index-by :id fields)]
       (mapv #(->card-metadata-column metadata-provider % card-id (get field-id->field (:id %))) cols)))))

(mr/def ::column
  [:merge
   ::lib.schema.metadata/column
   [:map
    [:lib/source [:= :source/card]]]])

(mr/def ::maybe-columns
  [:maybe [:sequential {:min 1} ::column]])

(def ^:private ^:dynamic *card-metadata-columns-card-ids*
  "Used to track the ID of Cards we're resolving columns for, to avoid infinite recursion for Cards that have circular
  references between one another."
  #{})

(defn- updated-result-metadata
  "Get `:result-metadata` from Card, but merge in updated values of `:active`."
  [metadata-providerable card]
  (when-let [saved-metadata-cols (not-empty (:result-metadata card))]
    (let [ids                       (into #{} (keep :id) saved-metadata-cols)
          id->metadata-provider-col (u/index-by :id (lib.metadata/bulk-metadata metadata-providerable :metadata/column ids))]
      (mapv (fn [saved-metadata-col]
              (merge
               saved-metadata-col
               (when-let [metadata-provider-col (id->metadata-provider-col (:id saved-metadata-col))]
                 (select-keys metadata-provider-col [:active]))))
            saved-metadata-cols))))

(mu/defn card->underlying-query :- ::lib.schema/query
  "Given a `card` return the underlying query that would be run if executing the Card directly. This is different from

    (lib/query mp (lib.metadata/card mp card-id))

  in that this creates a query based on the Card's `:dataset-query` (attaching `:result-metadata` to the last stage)
  rather than a query that has an empty stage with a `:source-card`.

  This is useful in cases where we want to splice in a Card's query directly (e.g., sanboxing) or for parameter
  calculation purposes."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (let [mp                                                            (lib.metadata/->metadata-provider metadata-providerable)
        {card-query :dataset-query, result-metadata :result-metadata} card]
    (cond-> (lib.query/query mp card-query)
      result-metadata (lib.util/update-query-stage -1 assoc :lib/stage-metadata (lib.normalize/->normalized-stage-metadata result-metadata)))))

(mu/defn- card-cols* :- [:maybe [:sequential ::lib.schema.metadata/column]]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-let [cols (or (not-empty (:fields card))
                      (not-empty (updated-result-metadata metadata-providerable card))
                      (not-empty (infer-returned-columns metadata-providerable card)))]
    (->card-metadata-columns metadata-providerable card cols)))

(mu/defn- source-model-card :- [:maybe ::lib.schema.metadata/card]
  "If `card` itself has a source card that is a Model, return that source card."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-let [card-query (some->> (:dataset-query card) not-empty (lib.query/query metadata-providerable))]
    (when-let [source-card-id (lib.util/source-card-id card-query)]
      (when-not (= source-card-id (:id card))
        (let [source-card (lib.metadata/card metadata-providerable source-card-id)]
          (when (= (:type source-card) :model)
            source-card))))))

(mu/defn- model-preserved-keys :- [:sequential :keyword]
  "Keys that can survive merging metadata from the database onto metadata computed from the query. When merging
  metadata, the types returned should be authoritative. But things like semantic_type, display_name, and description
  can be merged on top.

  Returns `:id` for native models only."
  [native-model? :- :boolean]
  (cond-> [:description :display-name :semantic-type :fk-target-field-id :settings :visibility-type :lib/source-display-name]
    native-model? (conj :id)))

;;; TODO (Cam 6/13/25) -- duplicated/overlapping responsibility with [[metabase.lib.field/previous-stage-metadata]] as
;;; well as [[metabase.lib.metadata.result-metadata/merge-model-metadata]] -- find a way to deduplicate these
(mu/defn merge-model-metadata :- [:sequential ::lib.schema.metadata/column]
  "Merge metadata from source model metadata into result cols.

  Overrides `:id` for native models only."
  [result-cols   :- [:maybe [:sequential ::lib.schema.metadata/column]]
   model-cols    :- [:maybe [:sequential ::lib.schema.metadata/column]]
   native-model? :- :boolean]
  (cond
    (and (seq result-cols)
         (empty? model-cols))
    result-cols

    (and (empty? result-cols)
         (seq model-cols))
    model-cols

    (and (seq result-cols)
         (seq model-cols))
    (let [name->model-col (m/index-by :name model-cols)]
      (mapv (fn [result-col]
              (merge
               result-col
               ;; if the result col is aggregating something in the source column then don't flow display name and what
               ;; not because the calculated one e.g. 'Sum of ____' is going to be better than '____'
               (when-not (= (:lib/source result-col) :source/aggregations)
                 (when-let [model-col (get name->model-col (:name result-col))]
                   (let [model-col     (u/select-non-nil-keys model-col (model-preserved-keys native-model?))
                         temporal-unit (lib.temporal-bucket/raw-temporal-bucket result-col)
                         binning       (lib.binning/binning result-col)
                         semantic-type ((some-fn model-col result-col) :semantic-type)]
                     (cond-> model-col
                       temporal-unit (update :display-name lib.temporal-bucket/ensure-ends-with-temporal-unit temporal-unit)
                       binning       (update :display-name lib.binning/ensure-ends-with-binning binning semantic-type)))))))
            result-cols))))

(mu/defn card-returned-columns :- [:maybe ::maybe-columns]
  "Get a normalized version of the saved metadata associated with Card metadata."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-not (contains? *card-metadata-columns-card-ids* (:id card))
    (binding [*card-metadata-columns-card-ids* (conj *card-metadata-columns-card-ids* (:id card))]
      (let [result-cols   (card-cols* metadata-providerable card)
            ;; don't pull in metadata from parent model if we ourself are a model
            model-card    (when-not (= (:type card) :model)
                            (source-model-card metadata-providerable card))
            model-cols    (when model-card
                            (card-cols* metadata-providerable model-card))
            ;; the BE passes metadata to the FE as virtual tables that contain `:type` and `:fields` but not `:dataset-query`
            ;; in this case we should not override the `:id` and assume that the `card` metadata is up-to-date
            ;; see (metabase#68012) for more details
            native-model? (and (some? model-card)
                               (some? (:dataset-query model-card))
                               (-> (card->underlying-query metadata-providerable model-card)
                                   (lib.util/native-stage? -1)))]
        (not-empty
         (into []
               ;; do not truncate the desired column aliases coming back in card metadata, if the query returns a
               ;; 'crazy long' column name then we need to use that in the next stage.
               ;; See [[metabase.lib.card-test/propagate-crazy-long-identifiers-from-card-metadata-test]]
               (lib.field.util/add-source-and-desired-aliases-xform metadata-providerable (lib.util.unique-name-generator/non-truncating-unique-name-generator))
               (cond-> result-cols
                 (seq model-cols) (merge-model-metadata model-cols native-model?))))))))

(mu/defn saved-question-metadata :- ::maybe-columns
  "Metadata associated with a Saved Question with `card-id`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id               :- ::lib.schema.id/card]
  ;; it seems like in some cases (unit tests) the FE is renaming `:result-metadata` to `:fields`, not 100% sure why
  ;; but handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card metadata-providerable card-id)]
    (card-returned-columns metadata-providerable card)))

(mu/defmethod lib.metadata.calculation/returned-columns-method :metadata/card :- ::lib.metadata.calculation/returned-columns
  [query         :- ::lib.schema/query
   _stage-number :- :int
   card          :- ::lib.schema.metadata/card
   options       :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (lib.computed/with-cache-sticky* query
    [::returned-columns (:id card) (lib.metadata.calculation/cacheable-options options)]
    (fn []
      (mapv (fn [col]
              (assoc col :lib/source :source/card, :lib/card-id (:id card)))
            (if (= (:type card) :metric)
              (let [metric-query (-> card
                                     :dataset-query
                                     (lib.util/update-query-stage -1 dissoc :aggregation :breakout))]
                (lib.metadata.calculation/returned-columns
                 (assoc metric-query :lib/metadata (:lib/metadata query))
                 -1
                 (lib.util/query-stage metric-query -1)
                 options))
              (card-returned-columns query card))))))

(mu/defn source-card-type :- [:maybe ::lib.schema.metadata/card.type]
  "The type of the query's source-card, if it has one."
  [query :- ::lib.schema/query]
  (when-let [card-id (lib.util/source-card-id query)]
    (when-let [card (lib.metadata/card query card-id)]
      (:type card))))

(mu/defn source-card-is-model? :- :boolean
  "Is the query's source-card a model?"
  [query :- ::lib.schema/query]
  (= (source-card-type query) :model))
