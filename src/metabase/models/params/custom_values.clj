(ns metabase.models.params.custom-values
  "Custom values for Parameters.

  A parameter with custom values will need to define a source:
  - static-list: the values is pre-defined and stored inside parameter's config
  - card: the values is a column from a saved question
  "
  (:require
   [clojure.string :as str]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.search.util :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- source=static-list --------------------------------------------------
(defn- query-matches
  "Filter the values according to the `search-term`.

  Values could have 2 shapes
  - [value1, value2]
  - [[value1, label1], [value2, label2]] - we search using label in this case"
  [query values]
  (let [normalized-query (search/normalize query)]
    (filter #(str/includes? (search/normalize (if (string? %)
                                                %
                                                ;; search by label
                                                (second %)))
                            normalized-query) values)))

(defn- static-list-values
  [{values-source-options :values_source_config :as _param} query]
  (when-let [values (:values values-source-options)]
    {:values          (if query
                        (query-matches query values)
                        values)
     :has_more_values false}))

;;; ---------------------------------------------------- source=card ------------------------------------------------------

(def ^:dynamic *max-rows*
  "Maximum number of rows returned when running a card.
  It's 1000 because it matches with the limit for chain-filter.
  Maybe we should lower it for the sake of displaying a parameter dropdown."
  1000)


(defn- values-from-card-query
  [card value-field query]
  (let [value-base-type (:base_type (qp.util/field->field-info value-field (:result_metadata card)))]
    {:database (:database_id card)
     :type     :query
     :query    (merge
                 {:source-table (format "card__%d" (:id card))
                  :breakout     [value-field]
                  :limit        *max-rows*}
                 {:filter [:and
                           [(if (isa? value-base-type :type/Text)
                              :not-empty
                              :not-null)
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

(defn card-values
  "Given a param and query returns the values."
  [{config :values_source_config :as _param} query]
  (let [card-id (:card_id config)
        card    (t2/select-one Card :id card-id)]
    (values-from-card card (:value_field config) query)))

(defn- can-get-card-values?
  [card value-field]
  (boolean
    (and (not (:archived card))
         (some? (qp.util/field->field-info value-field (:result_metadata card))))))

;;; --------------------------------------------- Putting it together ----------------------------------------------

(defn parameter->values
  "Given a parameter with a custom-values source, return the values.

  `default-case-thunk` is a 0-arity function that returns values list when:
  - :values_source_type = card but the card is archived or the card no longer contains the value-field.
  - :values_source_type = nil."
  [parameter query default-case-thunk]
  (case (:values_source_type parameter)
    "static-list" (static-list-values parameter query)
    "card"        (let [card (t2/select-one Card :id (get-in parameter [:values_source_config :card_id]))]
                    (when-not (mi/can-read? card)
                      (throw (ex-info "You don't have permissions to do that." {:status-code 403})))
                    (if (can-get-card-values? card (get-in parameter [:values_source_config :value_field]))
                      (card-values parameter query)
                      (default-case-thunk)))
    nil           (default-case-thunk)
    (throw (ex-info (tru "Invalid parameter source {0}" (:values_source_type parameter))
                    {:status-code 400
                     :parameter parameter}))))
