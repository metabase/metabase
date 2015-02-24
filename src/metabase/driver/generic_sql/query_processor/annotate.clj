(ns metabase.driver.generic-sql.query-processor.annotate
  "Functions related to annotating results returned by the Query Processor."
  (:require [metabase.db :refer :all]
            [metabase.models.field :refer [Field]]))

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
  (let [column-names (get-column-names results)]
    {:status :completed
     :row_count (count results)
     :data {:rows (map vals results)
            :columns column-names
            :cols (get-column-info query column-names)}}))

(defn- get-column-names
  "Get an ordered seqences of column names for the results."
  [results]
  (let [first-row (first results)]  ; just grab the keys from the first row
    (->> (keys first-row)
         (map name))))              ; convert to str because otherwise korma will try to qualify them like `"METABASE_FIELD"."FOLLOWERS_COUNT"

(defn- get-column-info
  "Get extra information about result columns. This is done by looking up matching `Fields` for the `Table` in QUERY or looking up
   information about special columns such as `count` via `get-special-column-info`."
  [query column-names]
  (let [table-id (get-in query [:query :source_table])
        columns (->> (sel :many [Field :id :table_id :name :description :base_type :special_type] ; lookup columns with matching names for this Table
                          :table_id table-id :name [in (set column-names)])
                     (map (fn [{:keys [name] :as column}]                                          ; build map of column-name -> column
                            {name (select-keys column [:id :table_id :name :description :base_type :special_type])}))
                     (apply merge {}))]
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
         (case column-name
           "count" {:base_type "IntegerField"
                    :special_type "number"}
           "sum" (let [summed-field-id (-> query :query :aggregation second)
                       summed-field (sel :one [Field :base_type :special_type] :id summed-field-id)]
                   (select-keys summed-field [:base_type :special_type])))))
