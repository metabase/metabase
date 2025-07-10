(ns metabase.lib.card
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.ident :as lib.metadata.ident]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

(mu/defmethod lib.metadata.calculation/visible-columns-method :metadata/card :- ::lib.metadata.calculation/visible-columns
  [query                                              :- ::lib.schema/query
   stage-number                                       :- :int
   {:keys [fields result-metadata] :as card-metadata} :- ::lib.schema.metadata/card
   {:keys [include-implicitly-joinable?] :as options} :- [:maybe ::lib.metadata.calculation/visible-columns.options]]
  (concat
   (lib.metadata.calculation/returned-columns query stage-number card-metadata options)
   (when include-implicitly-joinable?
     (lib.metadata.calculation/implicitly-joinable-columns query stage-number (concat fields result-metadata)))))

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
  [metadata-providerable                :- ::lib.schema.metadata/metadata-providerable
   {card-query :dataset-query :as card} :- :map]
  (when (some? card-query)
    (let [cols      (lib.metadata.calculation/returned-columns (lib.query/query metadata-providerable card-query))
          model-eid (when (= (:type card) :model)
                      (:entity-id card))]
      (cond->> cols
        model-eid (map #(lib.metadata.ident/add-model-ident % model-eid))))))

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
                                (update-keys u/->kebab-case-en))
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
        col (cond-> (merge
                     {:base-type :type/*, :lib/type :metadata/column}
                     field-metadata
                     (m/filter-vals some? source-metadata-col)
                     {:lib/type                :metadata/column
                      :lib/source              :source/card
                      :lib/source-column-alias ((some-fn :lib/source-column-alias :name) source-metadata-col)})
              card-id
              (assoc :lib/card-id card-id)

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
        ;; :effective-type is required, but not always set, see e.g.,
        ;; [[metabase.warehouse-schema.api.table/card-result-metadata->virtual-fields]]
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
                                      [:sequential ::lib.schema.metadata/card.result-metadata.map]
                                      [:map
                                       [:columns [:sequential ::lib.schema.metadata/card.result-metadata.map]]]]]]
   ;; Card `result-metadata` SHOULD be a sequence of column infos, but just to be safe handle a map that
   ;; contains` :columns` as well.
   (when-let [cols (not-empty (cond
                                (map? cols)        (:columns cols)
                                (sequential? cols) cols))]
     (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
           card-id           (when card-or-id-or-nil (u/the-id card-or-id-or-nil))
           field-ids         (keep :id cols)
           fields            (lib.metadata.protocols/metadatas metadata-provider :metadata/column field-ids)
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
  "Used to track the ID of Cards we're resolving columns for, to avoid inifinte recursion for Cards that have circular
  references between one another."
  #{})

(mu/defn- card-cols* :- [:maybe [:sequential ::lib.schema.metadata/column]]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-let [cols (or (:fields card)
                      (:result-metadata card)
                      (infer-returned-columns metadata-providerable card))]
    (->card-metadata-columns metadata-providerable card cols)))

(mu/defn- source-model-cols :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "If `card` itself has a source card that is a Model, return that Model's columns."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-let [card-query (some->> (:dataset-query card) (lib.query/query metadata-providerable))]
    (when-let [source-card-id (lib.util/source-card-id card-query)]
      (when-not (= source-card-id (:id card))
        (let [source-card (lib.metadata/card metadata-providerable source-card-id)]
          (when (= (:type source-card) :model)
            (card-cols* metadata-providerable source-card)))))))

(def ^:private model-preserved-keys
  "Keys that can survive merging metadata from the database onto metadata computed from the query. When merging
  metadata, the types returned should be authoritative. But things like semantic_type, display_name, and description
  can be merged on top."
  [:id :description :display-name :semantic-type :fk-target-field-id :settings :visibility-type
   :lib/source-display-name])

;;; TODO (Cam 6/13/25) -- duplicated/overlapping responsibility with [[metabase.lib.field/previous-stage-metadata]] as
;;; well as [[metabase.lib.metadata.result-metadata/merge-model-metadata]] -- find a way to deduplicate these
(mu/defn merge-model-metadata :- [:sequential ::lib.schema.metadata/column]
  "Merge metadata from source model metadata into result cols."
  [result-cols :- [:maybe [:sequential ::lib.schema.metadata/column]]
   model-cols  :- [:maybe [:sequential ::lib.schema.metadata/column]]]
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
                   (let [model-col     (u/select-non-nil-keys model-col model-preserved-keys)
                         temporal-unit (lib.temporal-bucket/raw-temporal-bucket result-col)
                         binning       (lib.binning/binning result-col)
                         semantic-type ((some-fn model-col result-col) :semantic-type)]
                     (cond-> model-col
                       temporal-unit (update :display-name lib.temporal-bucket/ensure-ends-with-temporal-unit temporal-unit)
                       binning       (update :display-name lib.binning/ensure-ends-with-binning binning semantic-type)))))))
            result-cols))))

(mu/defn card-metadata-columns :- [:maybe ::maybe-columns]
  "Get a normalized version of the saved metadata associated with Card metadata."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card                  :- ::lib.schema.metadata/card]
  (when-not (contains? *card-metadata-columns-card-ids* (:id card))
    (binding [*card-metadata-columns-card-ids* (conj *card-metadata-columns-card-ids* (:id card))]
      (let [result-cols (card-cols* metadata-providerable card)
            ;; don't pull in metadata from parent model if we ourself are a model
            model-cols  (when-not (= (:type card) :model)
                          (source-model-cols metadata-providerable card))]
        (not-empty
         (into []
               (lib.field.util/add-source-and-desired-aliases-xform metadata-providerable)
               (cond-> result-cols
                 (seq model-cols) (merge-model-metadata model-cols))))))))

(mu/defn saved-question-metadata :- ::maybe-columns
  "Metadata associated with a Saved Question with `card-id`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   card-id               :- ::lib.schema.id/card]
  ;; it seems like in some cases (unit tests) the FE is renaming `:result-metadata` to `:fields`, not 100% sure why
  ;; but handle that case anyway. (#29739)
  (when-let [card (lib.metadata/card metadata-providerable card-id)]
    (card-metadata-columns metadata-providerable card)))

(mu/defmethod lib.metadata.calculation/returned-columns-method :metadata/card :- ::lib.metadata.calculation/returned-columns
  [query         :- ::lib.schema/query
   _stage-number :- :int
   card          :- ::lib.schema.metadata/card
   options       :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (mapv (fn [col]
          (assoc col :lib/source :source/card))
        (if (= (:type card) :metric)
          (let [metric-query (-> card :dataset-query mbql.normalize/normalize lib.convert/->pMBQL
                                 (lib.util/update-query-stage -1 dissoc :aggregation :breakout))]
            (not-empty (lib.metadata.calculation/returned-columns
                        (assoc metric-query :lib/metadata (:lib/metadata query))
                        -1
                        (lib.util/query-stage metric-query -1)
                        options)))
          (card-metadata-columns query card))))

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
