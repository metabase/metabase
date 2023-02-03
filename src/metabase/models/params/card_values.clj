(ns metabase.models.params.card-values
  "Code related to getting values for a parameter where its source values is a card."
  (:require
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan.db :as db]))

(def ^:dynamic *max-rows*
  "Maximum number of rows returned when running a card.
  It's 1000 because it matches with the limit for chain-filter.
  Maybe we should lower it for the sake of displaying a parameter dropdown."
  1000)

(def field-options-for-identification
   "Set of FieldOptions that only mattered for identification purposes." ;; base-type is required for field that use name instead of id
   #{:source-field :join-alias :base-type})

(defn- field-normalizer
   [field]
   (let [[type id-or-name options ] (mbql.normalize/normalize-tokens field)]
      [type id-or-name (select-keys options field-options-for-identification)]))

(defn- field->field-info
   [field result-metadata]
   (let [[_ttype id-or-name options :as field] (field-normalizer field)]
      (or
         ;; try match field_ref first
         (first (filter (fn [field-info]
                           (= field
                              (-> field-info
                                  :field_ref
                                  field-normalizer)))
                        result-metadata))
         ;; if not match name and base type for aggregation or field with string id
         (first (filter (fn [field-info]
                            (and (= (:name field-info)
                                    id-or-name)
                                 (= (:base-type options)
                                    (:base-type field-info))))
                        result-metadata)))))

(defn- values-from-card-query
  [card value-field query]
  (let [value-base-type (:base_type (field->field-info value-field (:result_metadata card)))]
     {:database (:database_id card)
      :type     :query
      :query    (merge
                   {:source-table (format "card__%d" (:id card))
                    :breakout     [value-field]
                    :limit        *max-rows*}
                   {:filter [:and
                             [(if-not (isa? value-base-type :type/Text)
                                 :not-null
                                 :not-empty)
                              value-field]
                             (when query
                                (if-not (isa? value-base-type :type/Text)
                                   [:= value-field query]
                                   [:contains [:lower value-field] (u/lower-case-en query)]))]})
      :middleware {:disable-remaps? true}}))

(mu/defn values-from-card
  "Get distinct values of a field from a card.

  (values-from-card 1 [:field \"name\" nil] \"red\")
  ;; will execute a mbql that looks like
  ;; {:source-table (format \"card__%d\" card-id)
  ;;  :fields       [value-field]
  ;;  :breakout     [value-field]
  ;;  :filter       [:contains [:lower value-field] \"red\"]
  ;;  :limit        *max-rows*}
  =>
  {:values          [\"Red Medicine\"]
   :has_more_values false}
  "
  ([card value-field]
   (values-from-card card value-field nil))

  ([card            :- (ms/InstanceOf Card)
    value-field     :- ms/Field
    query           :- [:any]]
   (let [mbql-query   (values-from-card-query card value-field query)
         result       (qp/process-query mbql-query)
         values       (map first (get-in result [:data :rows]))]
     {:values          values
      ;; if the row_count returned = the limit we specified, then it's probably has more than that
      :has_more_values (= (:row_count result)
                          (get-in mbql-query [:query :limit]))})))

(defn param->values
  "Given a param and query returns the values."
  [{config :values_source_config :as _param} query]
  (let [card-id (:card_id config)
        card    (db/select-one Card :id card-id)]
    (when-not card
      (throw (ex-info (tru "Source card not found")
                      {:card-id     card-id
                       :status-code 400})))
    (when (:archived card)
      (throw (ex-info (tru "Source card is archived")
                      {:card-id     card-id
                       :status-code 400})))
    (values-from-card card (:value_field config) query)))
