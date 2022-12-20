(ns metabase.models.params.custom-values
  (:require
    [clojure.string :as str]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.models :refer [Card]]
    [metabase.query-processor :as qp]
    [metabase.util.i18n :refer [tru]]
    [toucan.db :as db]))

(def ^{:dynamic true
       :doc     "Maximum number of values returned when running a card."}
  *max-rows* 2000)

(defn- field-ref->mbql-field
  [field-ref result-metadata card-id]
  (case (first field-ref)

    :aggregation
    (if-let [{:keys [name effective-type base-type]}
             (first (filter #(= (:field_ref %) field-ref) result-metadata))]
      [:field name {:base-type (or effective-type base-type)}]
      (throw (ex-info (tru "No field found for with field_ref: {0}" field-ref)
                      {:field-ref field-ref
                       :card-id   card-id})))
    :field
    field-ref

    (throw (ex-info (tru "Invalid field-ref type")
                    {:field-ref field-ref
                     :card-id   card-id}))))


(defn- filter-clause
  [field-to-filter query]
  {:filter [:contains [:lower field-to-filter] (str/lower-case query)]})

(defn- custom-values-query
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
                   (filter-clause value-field query)))
     :middleware {:disable-remaps? true}}))

(defn- get-values-for-card
  "a docstring"
  ([card-id value-field-ref]
   (get-values-for-card card-id value-field-ref nil))

  ([card-id value-field-ref query]
   (let [mbql-query   (custom-values-query card-id value-field-ref query)
         query-limit  (get-in mbql-query [:query :limit])
         result       (qp/process-query mbql-query)]
     {:values          (map first (get-in result [:data :rows]))
      ;; if the row_count returned = the limit we specified, then it's probably has more than that
      :has_more_values (= (:row_count result) query-limit)})))

(defn param->values
  "a docstring."
  [{source-options :source_options :as _param} query]
  (get-values-for-card (:card_id source-options) (:value_field_ref source-options) query))
