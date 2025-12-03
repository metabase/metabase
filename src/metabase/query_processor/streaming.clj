(ns metabase.query-processor.streaming
  (:refer-clojure :exclude [every? some mapv not-empty])
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming.csv :as qp.csv]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.query-processor.streaming.json :as qp.json]
   [metabase.query-processor.streaming.xlsx :as qp.xlsx]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? mapv some not-empty]])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (java.io OutputStream)
   (metabase.server.streaming_response StreamingResponse)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

;; these are loaded for side-effects so their impls of `qp.si/results-writer` will be available
;; TODO - consider whether we should lazy-load these!
(comment qp.csv/keep-me
         qp.json/keep-me
         qp.xlsx/keep-me)

(defn safe-filename-prefix
  "Generate a safe filename prefix from a card name. Trims whitespace, slugifies the name,
  and limits to 200 characters to respect filesystem limitations. Falls back to 'question' if empty."
  [card-name]
  (or (some-> card-name
              str/trim
              not-empty
              (u/slugify {:max-length 200}))
      "question"))

(defn- deduplicate-col-names
  "Deduplicate column names that would otherwise conflict.

  TODO: This function includes logic that is normally is done by the annotate middleware, but hasn't been run yet
  at this point in the code. We should eventually refactor this (#17195)

  TODO (Cam 9/23/25) -- We should use [[metabase.lib.field.util/add-deduplicated-names]] to do this."
  [cols]
  (mapv (let [unique-name-fn (lib/non-truncating-unique-name-generator)]
          (fn [col]
            (let [unique-name (unique-name-fn (:name col))]
              (-> col
                  (cond-> (not (:display_name col)) (assoc :display_name (:name col)))
                  (assoc :name unique-name)))))
        cols))

(defn- validate-table-columns
  "Validate that all of the columns in `table-columns` correspond to actual columns in `cols`, correlating them by
  field ref or name. Returns `nil` if any do not, so that we fall back to using `cols` directly for the export (#19465).
  Otherwise returns `table-columns`."
  [table-columns cols]
  (let [col-field-refs (set (remove nil? (map :field_ref cols)))
        col-names      (set (remove nil? (map :name cols)))]
    (when (every? (fn [table-col] (or (col-field-refs (::mb.viz/table-column-field-ref table-col))
                                      (col-names (::mb.viz/table-column-name table-col))))
                  table-columns)
      table-columns)))

(defn- not-explicitly-excluded-columns
  "If a column is not explicitly excluded (it doesn't have a row in `table-columns` that marks it as disabled), we
  should include it. This way, if e.g. the query has changed from `SELECT id FROM ...` to `SELECT id, created_at FROM
  ...`, we'll include the new columns. (This is the same behavior as the UI.)"
  [table-columns cols]
  (let [{:keys [name->table field-ref->table]} (reduce (fn [m {n ::mb.viz/table-column-name
                                                               fr ::mb.viz/table-column-field-ref
                                                               :as table}]
                                                         (cond-> m
                                                           true (assoc-in [:name->table n] table)
                                                           fr (assoc-in [:field-ref->table fr] table)))
                                                       {}
                                                       table-columns)]
    (for [col cols
          :when (and (not (get name->table (:name col)))
                     (not (get field-ref->table (:field_ref col))))
          :let [col-name (:name col)
                id-or-name (or (:id col) col-name)
                field-ref (:field_ref col)]]
      {::mb.viz/table-column-field-ref (or field-ref [:field id-or-name nil])
       ::mb.viz/table-column-enabled   true
       ::mb.viz/table-column-name      col-name})))

(defn- pivot-grouping-exists?
  "Returns `true` if there's a column with the :name \"pivot-grouping\",
  which is an internal detail from the pivot qp."
  [cols]
  (some #(= (:name %) "pivot-grouping") cols))

(defn- export-column-order
  "For each entry in `table-columns` that is enabled, finds the index of the corresponding
  entry in `cols` by name or id. If a col has been remapped, uses the index of the new column.

  The resulting list of indices determines the order of column names and data in exports."
  [cols table-columns]
  (if (pivot-grouping-exists? cols)
    ;; If the columns contain a pivot-grouping, we're exporting a pivot and the cols order is not used,
    ;; so we can just pass the indices in order.
    (range (count cols))
    (let [table-columns'     (or (when-let [tcs (seq (validate-table-columns table-columns cols))]
                                   (concat
                                    (filter ::mb.viz/table-column-enabled tcs)
                                    (not-explicitly-excluded-columns table-columns cols)))
                                 ;; If table-columns is not provided (e.g. for saved cards), we can construct a fake one
                                 ;; that retains the original column ordering in `cols`
                                 (for [col cols]
                                   (let [col-name   (:name col)
                                         id-or-name (or (:id col) col-name)
                                         field-ref  (:field_ref col)]
                                     {::mb.viz/table-column-field-ref (or field-ref [:field id-or-name nil])
                                      ::mb.viz/table-column-enabled   true
                                      ::mb.viz/table-column-name      col-name})))
          cols-vector        (into [] cols)
          ;; cols-index is a map from keys representing fields to their indices into `cols`
          cols-index         (reduce-kv (fn [m i col]
                                          ;; Always add col-name as a key, so that native queries and remapped fields work correctly
                                          (let [m' (assoc m (:name col) i)]
                                            (if-let [field-ref (:field_ref col)]
                                              ;; Add a map key based on the column's field-ref, if available
                                              (assoc m' field-ref i)
                                              m')))
                                        {}
                                        cols-vector)]
      (->> (map
            (fn [{field-ref ::mb.viz/table-column-field-ref, col-name ::mb.viz/table-column-name}]
              (let [index              (or (get cols-index field-ref)
                                           (get cols-index col-name))
                    col                (get cols-vector index)
                    remapped-to-name   (:remapped_to col)
                    remapped-from-name (:remapped_from col)]
                (cond
                  remapped-to-name
                  (get cols-index remapped-to-name)

                  (not remapped-from-name)
                  index)))
            table-columns')
           (remove nil?)))))

(defn order-cols
  "Dedups and orders `cols` based on the contents of table-columns in the provided viz settings. Also
  returns a list of indices which map the new order to the original order, and is used to reorder individual rows."
  [cols viz-settings]
  (let [deduped-cols  (deduplicate-col-names cols)
        output-order  (export-column-order deduped-cols (::mb.viz/table-columns viz-settings))
        ordered-cols  (if output-order
                        (let [v (into [] deduped-cols)]
                          (for [i output-order] (v i)))
                        deduped-cols)]
    [ordered-cols output-order]))

(mu/defn- streaming-rff :- ::qp.schema/rff
  [results-writer :- (lib.schema.common/instance-of-class metabase.query_processor.streaming.interface.StreamingResultsWriter)]
  (fn [{:keys [cols viz-settings] :as initial-metadata}]
    (let [[ordered-cols output-order] (order-cols cols viz-settings)
          viz-settings'               (assoc viz-settings :output-order output-order)
          row-count                   (volatile! 0)]
      (fn
        ([]
         (log/trace "Writing initial metadata to results writer.")
         (qp.si/begin! results-writer
                       {:data (assoc initial-metadata :ordered-cols ordered-cols)}
                       viz-settings')
         {:data initial-metadata})

        ([result]
         (assoc result
                :row_count @row-count
                :status :completed))

        ([metadata row]
         (log/trace "Writing one row to results writer.")
         (qp.si/write-row! results-writer row (dec (vswap! row-count inc)) ordered-cols viz-settings')
         metadata)))))

(mu/defn- streaming-result-fn :- fn?
  [results-writer   :- (lib.schema.common/instance-of-class metabase.query_processor.streaming.interface.StreamingResultsWriter)
   ^OutputStream os :- (lib.schema.common/instance-of-class OutputStream)]
  (fn result [result]
    (when (= (:status result) :completed)
      (log/debug "Finished writing results; closing results writer.")
      (try
        (qp.si/finish! results-writer result)
        (catch EofException _e
          (log/warn "Client closed connection prematurely")))
      (u/ignore-exceptions
        (.flush os)
        (.close os)))
    (qp.pipeline/default-result-handler result)))

(defn do-with-streaming-rff
  "Context to pass to the QP to streaming results as `export-format` to an output stream. Can be used independently of
  the normal `streaming-response` macro, which is geared toward Ring responses.

    (with-open [os ...]
      (qp.streaming/do-with-streaming-rff
       :csv os
       (fn [rff]
         (qp/process-query query rff))))"
  [export-format os f]
  (let [results-writer (qp.si/streaming-results-writer export-format os)
        rff            (streaming-rff results-writer)]
    (binding [qp.pipeline/*result* (streaming-result-fn results-writer os)]
      (f rff))))

(defn -streaming-response
  "Impl for [[streaming-response]]."
  ^StreamingResponse [export-format filename-prefix f]
  (streaming-response/streaming-response (qp.si/stream-options export-format filename-prefix) [os canceled-chan]
    (do-with-streaming-rff
     export-format os
     (^:once fn* [rff]
       (let [result (try
                      (binding [qp.pipeline/*canceled-chan* canceled-chan]
                        (f rff))
                      (catch Throwable e
                        e))]
         (if (nil? result)
           (do
             (assert (qp.pipeline/canceled?* canceled-chan)
                     "QP unexpectedly returned nil.")
             ;; Create a cancelled result to trigger possible proper cleanup?
             ;; If canceled, nobody should be receiving the stream.
             {:status :canceled, :row_count 0, :data {:cols []}})
           (do
             ;; if you see this, it's because it's old code written before the changes in #35465... rework the code in
             ;; question to return a response directly instead of a core.async channel
             (assert (not (instance? ManyToManyChannel result)) "QP should not return a core.async channel.")
             (when (or (instance? Throwable result)
                       (= (:status result) :failed))
               (streaming-response/write-error! os result export-format)))))))))

(defn transforming-query-response
  "Decorate the streaming rff to transform the top-level payload."
  [rff f]
  (fn [metadata]
    (let [rf (rff metadata)]
      (completing rf (comp f rf)))))

(defmacro streaming-response
  "Return results of processing a query as a streaming response. This response implements the appropriate Ring/Compojure
  protocols, so return or `respond` with it directly. `export-format` is one of `:api` (for normal JSON API
  responses), `:json`, `:csv`, or `:xlsx` (for downloads).

  Typical example:

    (api.macros/defendpoint :get \"/whatever\" []
      (qp.streaming/streaming-response [rff :json]
        (qp/process-query (qp/userland-query-with-default-constraints query) rff)))

  Handles either async or sync QP results, but you should prefer returning sync results so we can handle query
  cancelations properly."
  {:style/indent 1}
  [[map-binding export-format filename-prefix] & body]
  `(-streaming-response ~export-format ~filename-prefix (^:once fn* [~map-binding] ~@body)))
