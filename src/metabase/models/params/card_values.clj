(ns metabase.models.params.card-values
  "Code related to getting values for a parameter where its source values is a card."
  (:require
   [clojure.string :as str]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]))

(def ^:dynamic *max-rows*
  "Maximum number of rows returned when running a card.
  It's 1000 because it matches with the limit for chain-filter.
  Maybe we should lower it for the sake of displaying a parameter dropdown."
  1000)

(defn- values-from-card-query
  [card-id value-field query]
  (let [card        (db/select-one Card :id card-id)]
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
  "Get values a field from a card.

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

  ([card-id     :- su/IntGreaterThanZero
    value-field :- su/Field
    query       :- (s/maybe su/NonBlankString)]
   (let [mbql-query   (values-from-card-query card-id value-field query)
         query-limit  (get-in mbql-query [:query :limit])
         result       (qp/process-query mbql-query)]
     {:values          (map first (get-in result [:data :rows]))
      ;; if the row_count returned = the limit we specified, then it's probably has more than that
      :has_more_values (= (:row_count result) query-limit)})))

(defn param->values
  "Given a param and query returns the values."
  [{config :values_source_config :as _param} query]
  (values-from-card (:card_id config) (:value_field config) query))
