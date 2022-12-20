(ns metabase.models.params.custom-values
  (:require
    [clojure.string :as str]
    [metabase.mbql.normalize :as mbql.normalize]
    [metabase.models :refer [Card]]
    [metabase.query-processor :as qp]
    [metabase.search.util :as search]
    [metabase.util.i18n :refer [tru]]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]))

;; -------------------------------------- source=card --------------------------------------

(def ^{:dynamic true
       :doc     "Maximum number of rows returned when running a card."}
  *max-rows* 2000)

(defn- field-ref->mbql-field
  "Find field by field_ref.

  If field_ref is a:
  - field: returns itself
  - aggregation: reference the field by name [:field aggregation-name {]}]"
  [field-ref result-metadata card-id]
  (let [field (first (filter #(= (:field_ref %) field-ref) result-metadata))]
    (when-not field
      (throw (ex-info (tru "No field found with field_ref: {0}" field-ref)
                      {:field-ref field-ref
                       :card-id   card-id})))
    (case (first field-ref)
      :aggregation
      [:field (:name field) {:base-type ((some-fn :effective_type :base_type) field)}]

      :field
      field-ref

      (throw (ex-info (tru "Invalid field-ref type. Must be a field or aggregation.")
                      {:field-ref field-ref
                       :card-id   card-id})))))

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
                   {:filter [:contains [:lower value-field] (str/lower-case query)]}))
     :middleware {:disable-remaps? true}}))

(s/defn values-from-card
  "Get a column from of a card using field_ref.

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
   (let [mbql-query   (custom-values-query card-id value-field-ref query)
         query-limit  (get-in mbql-query [:query :limit])
         result       (qp/process-query mbql-query)]
     {:values          (map first (get-in result [:data :rows]))
      ;; if the row_count returned = the limit we specified, then it's probably has more than that
      :has_more_values (= (:row_count result) query-limit)})))

;; ------------------------------------ source=static-list ------------------------------------

(defn query-matches
  "Filter the values according to the `search-term`.

  Values could have 2 shapes
  - [value1, value2]
  - [[value1, label1], [value2, label2]] - we search using label in this case"
  [search-term values]
  (if (str/blank? search-term)
    values
    (let [normalized-search-term (search/normalize search-term)]
      (filter #(str/includes? (search/normalize (if (string? %)
                                                  %
                                                  ;; search by label
                                                  (second %)))
                              normalized-search-term) values))))
