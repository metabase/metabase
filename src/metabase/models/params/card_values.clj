(ns metabase.models.params.card-values
  "Code related to getting values for a parameter where its source values is a card."
  (:require
    [clojure.string :as str]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.mbql.schema :as mbql.s]
    [metabase.models :refer [Card]]
    [metabase.query-processor :as qp]
    [metabase.util.i18n :refer [tru]]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]))

(def ^{:dynamic true
       :doc     "Maximum number of rows returned when running a card."}
  *max-rows* 2000)

(defn- field-ref->mbql-field
  "Find field by field_ref.

  If field_ref is a:
  - field: returns itself
  - aggregation: returns a field using name [:field aggregation-name nil]"
  [field-ref result-metadata card-id]
  (let [field (first (filter #(= (:field_ref %) field-ref) result-metadata))]
    (when-not field
      (throw (ex-info (tru "No matching field found")
                      {:status-code 400
                       :card-id     card-id
                       :field-ref   field-ref})))
    (case (first field-ref)
      :aggregation
      [:field (:name field) {:base-type ((some-fn :effective_type :base_type) field)}]

      :field
      (let [[_ttype identifier options] field-ref]
        ;; TODO: the options for field-ref does contains the binning information
        ;; maybe we could just need to select it from options?
        (when (some? (:binning options))
              (throw (ex-info (tru "Binning column not supported")
                              {:status-code 400
                               :card-id     card-id
                               :field-ref   field-ref})))
        [:field identifier (select-keys options mbql.s/field-options-for-identification)])

      (throw (ex-info (tru "Invalid field-ref type. Must be a field or aggregation.")
                      {:status-code 400
                       :card-id     card-id
                       :field-ref   field-ref})))))

(defn- values-from-card-query
  [card-id value-field-ref query]
  (let [value-field-ref (mbql.normalize/normalize-tokens value-field-ref)
        card            (db/select-one Card :id card-id)
        value-field     (field-ref->mbql-field value-field-ref (:result_metadata card) card-id)]
    {:database (:database_id card)
     :type     :query
     :query    (merge
                 {:source-table (format "card__%d" card-id)
                  :fields       [value-field]
                  :limit        *max-rows*}
                 (when query
                   {:filter [:contains [:lower value-field] (str/lower-case query)]}))
     :middleware {:disable-remaps? true}}))

(s/defn values-from-card
  "Get a column of a card using field_ref.

  (values-from-card 1 [:field \"name\" nil] \"red\")
  ;; will execute a mbql that looks like
  ;; {:source-table (format \"card__%d\" card-id)
  ;;  :fields       [value-field]
  ;;  :filter       [:contains [:lower value-field] \"red\"]
  ;;  :limit        *max-rows*}
  =>
  {:values          [\"Red Medicine\"]
   :has_more_values false}
  "
  ([card-id value-field-ref]
   (values-from-card card-id value-field-ref nil))

  ([card-id         :- su/IntGreaterThanZero
    value-field-ref :- su/FieldRef
    query           :- (s/maybe su/NonBlankString)]
   (let [mbql-query   (values-from-card-query card-id value-field-ref query)
         query-limit  (get-in mbql-query [:query :limit])
         result       (qp/process-query mbql-query)]
     {:values          (map first (get-in result [:data :rows]))
      ;; if the row_count returned = the limit we specified, then it's probably has more than that
      :has_more_values (= (:row_count result) query-limit)})))
