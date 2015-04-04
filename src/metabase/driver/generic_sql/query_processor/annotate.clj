(ns metabase.driver.generic-sql.query-processor.annotate
  "Functions related to annotating results returned by the Query Processor."
  (:require [metabase.db :refer :all]
            [metabase.models.field :refer [Field field->fk-table]]))

(declare get-column-names
         get-column-info
         get-special-column-info)

(defn annotate
  "Take raw RESULTS from running QUERY and convert them to the format expected by the front-end.
   Add the following columns (under `:data`):

   *  `:rows` a sequence of result rows
   *  `:columns` ordered sequence of column names
   *  `:cols` ordered sequence of information about each column, such as `:base_type` and `:special_type`"
  [query results]
  (let [column-names (get-column-names query results)]
    {:status :completed
     :row_count (count results)
     :data {:rows (->> results
                       (map #(map %                             ; pull out the values in each result in the same order we got from get-column-names
                                  (map keyword column-names))))
            :columns column-names
            :cols (get-column-info query column-names)}}))

(defn- get-column-names
  "Get an ordered seqences of column names for the results.
   If a `fields` clause was specified in the Query Dict, we want to return results in the same order."
  [query results]
  (let [field-ids (-> query :query :fields)
        fields-clause-fields (when-not (or (empty? field-ids)
                                           (= field-ids [nil]))
                               (let [field-id->name (->> (sel :many [Field :id :name]
                                                              :id [in field-ids])     ; Fetch names of fields from `fields` clause
                                                         (map (fn [{:keys [id name]}]  ; build map of field-id -> field-name
                                                                {id (keyword name)}))
                                                         (into {}))]
                                 (map field-id->name field-ids)))                     ; now get names in same order as the IDs
        other-fields (->> (first results)
                          keys                                                        ; Get the names of any other fields that were returned (i.e., `sum`)
                          (filter #(not (contains? (set fields-clause-fields) %))))]
    (->> (concat fields-clause-fields other-fields)                                   ; Return a combined vector. Convert them to strs, otherwise korma
         (map name))))                                                                ; will qualify them like `"METABASE_FIELD"."FOLLOWERS_COUNT"

(defn- uncastify
  "Remove CAST statements from a column name if needed.

    (uncastify \"DATE\")               -> \"DATE\"
    (uncastify \"CAST(DATE AS DATE)\") -> \"DATE\""
  [column-name]
  (or (second (re-find #"CAST\(([^\s]+) AS [\w]+\)" column-name))
      column-name))

(defn- get-column-info
  "Get extra information about result columns. This is done by looking up matching `Fields` for the `Table` in QUERY or looking up
   information about special columns such as `count` via `get-special-column-info`."
  [query column-names]
  (let [table-id (get-in query [:query :source_table])
        column-names (map uncastify column-names)
        columns (->> (sel :many [Field :id :table_id :name :description :base_type :special_type] ; lookup columns with matching names for this Table
                          :table_id table-id :name [in (set column-names)])
                     (map (fn [{:keys [name] :as column}]                                         ; build map of column-name -> column
                            {name (-> (select-keys column [:id :table_id :name :description :base_type :special_type])
                                      (assoc :extra_info (if-let [fk-table (field->fk-table column)]
                                                           {:target_table_id (:id fk-table)}
                                                           {})))}))
                     (into {}))]
    (->> column-names
         (map (fn [column-name]
                (or (columns column-name)                             ; try to get matching column from the map we build earlier
                    (get-special-column-info query column-name))))))) ; if it's not there then it's a special column like `count`

(defn- get-special-column-info
  "Get info like `:base_type` and `:special_type` for a special aggregation column like `count` or `sum`."
  [query column-name]
  (merge {:name column-name
          :id nil
          :table_id nil
          :description nil}
         (let [aggregation-type (keyword column-name)                                ; For aggregations of a specific Field (e.g. `sum`)
               field-aggregation? (contains? #{:avg :stddev :sum} aggregation-type)] ; lookup the field we're aggregating and return its
           (if field-aggregation? (sel :one :fields [Field :base_type :special_type] ; type info. (The type info of the aggregate result
                                       :id (-> query :query :aggregation second))    ; will be the same.)
               (case aggregation-type                                                ; Otherwise for general aggregations such as `count`
                 :count {:base_type :IntegerField                                    ; just return hardcoded type info
                         :special_type :number})))))
