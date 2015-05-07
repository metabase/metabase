(ns metabase.driver.generic-sql.query-processor.annotate
  "Functions related to annotating results returned by the Query Processor."
  (:require [metabase.db :refer :all]
            [metabase.driver.query-processor :as qp]
            [metabase.driver.generic-sql.util :as gsu]
            [metabase.models.field :refer [Field field->fk-table]]))

(declare get-column-names
         get-column-info
         uncastify)

(defn annotate
  "Take raw RESULTS from running QUERY and convert them to the format expected by the front-end.
   Add the following columns (under `:data`):

   *  `:rows` a sequence of result rows
   *  `:columns` ordered sequence of column names
   *  `:cols` ordered sequence of information about each column, such as `:base_type` and `:special_type`"
  [query results]
  (let [column-names    (get-column-names query results)
        column-name-kws (map keyword column-names)]
    {:rows (->> results
                (map (fn [row]
                       (map row column-name-kws))))
     :columns (map uncastify column-names)
     :cols (get-column-info query column-names)}))

(defn- order-columns
  [query castified-field-names]
  (binding [qp/*uncastify-fn* uncastify]
    (qp/order-columns query castified-field-names)))

(defn- get-column-names
  "Get an ordered seqences of column names for the results.
   If a `fields` clause was specified in the Query Dict, we want to return results in the same order."
  [query results]
  (let [field-ids (-> query :query :fields)
        fields-clause-fields (when-not (or (empty? field-ids)
                                           (= field-ids [nil]))
                               (let [field-id->name (->> (sel :many [Field :id :name :base_type]
                                                              :id [in field-ids])               ; Fetch names of fields from `fields` clause
                                                         (map (fn [{:keys [id name base_type]}]  ; build map of field-id -> field-name
                                                                {id (gsu/field-name+base-type->castified-key name base_type)}))
                                                         (into {}))]
                                 (map field-id->name field-ids)))                     ; now get names in same order as the IDs
        other-fields (->> (first results)
                          keys                                                        ; Get the names of any other fields that were returned (i.e., `sum`)
                          (filter #(not (contains? (set fields-clause-fields) %)))
                          (order-columns query))]
    (->> (concat fields-clause-fields other-fields)                                   ; Return a combined vector. Convert them to strs, otherwise korma
         (filter identity)                                                            ; remove any nils -- don't want a NullPointerException
         (map name))))                                                                ; will qualify them like `"METABASE_FIELD"."FOLLOWERS_COUNT"

(defn- uncastify
  "Remove CAST statements from a column name if needed.

    (uncastify \"DATE\")               -> \"DATE\"
    (uncastify \"CAST(DATE AS DATE)\") -> \"DATE\""
  [column-name]
  (or (second (re-find #"CAST\(([^\s]+) AS [\w]+\)" column-name))
      column-name))

(defn get-column-info
  "Wrapper for `metabase.driver.query-processor/get-column-info` that calls `uncastify` on column names."
  [query column-names]
  (qp/get-column-info query (map uncastify column-names)))
