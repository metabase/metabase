(ns metabase.driver.pinot.execute
  (:require
   [cheshire.core :as json]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- post-process
  [results]
  (log/debug "Raw results from Pinot: " results) ;; Log the raw results
  (let [column-names (get-in results [:resultTable :dataSchema :columnNames])
        rows (get-in results [:resultTable :rows])]
    (if (and column-names rows)
      (try
        (let [processed-results {:projections column-names  ;; Use inferred projections from the schema
                                  :results     (map (fn [row]
                                                      (zipmap column-names row)) ;; Map column names to each row's values
                                                    rows)}]
          processed-results)
        (catch Throwable e
          (throw (ex-info (tru "Error processing Pinot query results")
                          {:type qp.error-type/driver
                           :column-names column-names
                           :rows rows}
                          e))))
      (do
        (log/warn "No column names or rows found in the result: " results)
        {:projections nil
         :results     []}))))

(defn- result-metadata [col-names]
  ;; rename any occurances of `:timestamp___int` to `:timestamp` in the results so the user doesn't know about
  ;; our behind-the-scenes conversion and apply any other post-processing on the value such as parsing some
  ;; units to int and rounding up approximate cardinality values.
  (let [fixed-col-names (for [col-name col-names]
                          (case col-name
                            :timestamp___int  :timestamp
                            :distinct___count :count
                            col-name))]
    {:cols (vec (for [col-name fixed-col-names]
                  {:name      (u/qualified-name col-name)
                   ;; Placeholder so metadata is well formed, we'll infer actual types later
                   :base_type :type/*}))}))

(defn- result-rows [{rows :results} actual-col-names annotate-col-names]
  ;; Add debug logging to inspect the inputs
  (log/debug "actual-col-names:" actual-col-names ", annotate-col-names:" annotate-col-names)
  (log/debug "Rows (first 5):" (take 5 rows))

  ;; Ensure there are valid column names
  (if (and (nil? actual-col-names) (empty? actual-col-names)
          (nil? annotate-col-names) (empty? annotate-col-names))
    (throw (ex-info "No valid column names provided."
                    {:actual-col-names actual-col-names
                     :annotate-col-names annotate-col-names}))

    ;; Proceed with creating getter functions for the column names
    (let [getters (vec (map (fn [col-name]
                              (fn [row]
                                (if (contains? row col-name)
                                  (get row col-name)
                                  (throw (ex-info (tru "Column {0} not found in row" col-name)
                                                  {:col-name col-name
                                                   :row row})))))
                            actual-col-names))]

      ;; Return the result rows by applying the getter functions to the rows
      (mapv (fn [row]
              (mapv #(% row) getters))
              ;;(into {} (map (fn [getter col-name] [col-name (getter row)]) getters actual-col-names)))
            rows))))

(defn- remove-bonus-keys
  "Remove keys that start with `___` from the results -- they were temporary, and we don't want to return them."
  [columns]
  (vec (remove #(re-find #"^___" (name %)) columns)))

(defn- reduce-results
  [{{:keys [mbql?]} :native, :as outer-query} {:keys [projections], :as result} respond]
  (let [col-names (if mbql?
                    (->> projections
                         remove-bonus-keys
                         vec)
                    (let [first-result (first (:results result))]
                        (if (map? first-result) ;; Check if first result is a map
                          (map keyword (keys first-result))
                          (throw (ex-info "Expected the first result to be a map" {:first-result first-result})))))
        metadata (result-metadata col-names)
        annotate-col-names (->> (annotate/merged-column-info outer-query metadata)
                                (map (comp keyword :name)))
        rows (result-rows result col-names annotate-col-names)
        base-types (transduce identity (annotate/base-type-inferer metadata) rows)
        updated-metadata (update metadata :cols (fn [cols]
                                                  (map (fn [col base-type]
                                                         (assoc col :base_type base-type))
                                                       cols base-types)))]
    (log/debug "Responding with metadata and rows:" updated-metadata rows) ; Log for debugging
    (respond updated-metadata rows))) ; Pass metadata and rows directly in a single map

(defn execute-reducible-query
  "Execute a query for a Pinot DB."
  [execute* {{:keys [query]} :native :as mbql-query} respond]
  {:pre [query]}
  (let [details    (:details (lib.metadata/database (qp.store/metadata-provider)))
        query      (if (string? query)
                     (json/parse-string query keyword)
                     query)
        results    (try
                     (execute* details query)
                     (catch Throwable e
                       (throw (ex-info (tru "Error executing query: {0}" (ex-message e))
                                       {:type  qp.error-type/db
                                        :query query}
                                       e))))
        result     (try (post-process results)
                        (catch Throwable e
                          (throw (ex-info (tru "Error post-processing Pinot query results")
                                          {:type    qp.error-type/driver
                                           :results results}
                                          e))))]
    (try
      (reduce-results mbql-query result respond)
      (catch Throwable e
        (throw (ex-info (tru "Error reducing Pinot query results")
                        {:type           qp.error-type/driver
                         :results        results
                         :post-processed result}
                        e))))))
