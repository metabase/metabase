(ns metabase.query-processor.streaming
  (:require [clojure.core.async :as a]
            [metabase.async.streaming-response :as streaming-response]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.streaming.csv :as streaming.csv]
            [metabase.query-processor.streaming.interface :as i]
            [metabase.query-processor.streaming.json :as streaming.json]
            [metabase.query-processor.streaming.xlsx :as streaming.xlsx]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.util :as u])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           java.io.OutputStream
           metabase.async.streaming_response.StreamingResponse))

;; these are loaded for side-effects so their impls of `i/results-writer` will be available
;; TODO - consider whether we should lazy-load these!
(comment streaming.csv/keep-me
         streaming.json/keep-me
         streaming.xlsx/keep-me)

(defn- deduplicate-col-names
  "Deduplicate column names that would otherwise conflict.

  TODO: This function includes logic that is normally is done by the annotate middleware, but hasn't been run yet
  at this point in the code. We should eventually refactor this (#17195)"
  [cols]
  (map (fn [col unique-name]
         (let [col-with-display-name (if (:display_name col)
                                       col
                                       (assoc col :display_name (:name col)))]
           (assoc col-with-display-name :name unique-name)))
       cols
       (mbql.u/uniquify-names (map :name cols))))

(defn- field-ref->map-key
  "Converts the field-ref of a column to a vector that is used for lookups in the `cols-index` map in
  `export-column-order`.

  This key is similar to the original field-ref, but should only contain the minimum amount of information necessary to
  uniquely identify a field, while omitting extra metadata.

  TODO: It would be better if we could use the entire field-ref directly as the map key, or use a separate identifier.
  The issue currently is that `table-columns` is passed down from the frontend for unsaved cards (in the viz settings)
  and has to be parsed from JSON, so some fields in metadata might be strings instead of keywords."
  [field-ref]
  (if-let [join-alias (:join-alias (last field-ref))]
    [(keyword (first field-ref)) (second field-ref) {:join-alias join-alias}]
    [(keyword (first field-ref)) (second field-ref)]))

(defn- export-column-order
  "For each entry in `table-columns` that is enabled, finds the index of the corresponding
  entry in `cols` by name or id. If a col has been remapped, uses the index of the new column.

  The resulting list of indices determines the order of column names and data in exports."
  [cols table-columns]
  (let [table-columns'     (or table-columns
                               ;; If table-columns is not provided (e.g. for saved cards), we can construct a fake one
                               ;; that retains the original column ordering in `cols`
                               (for [col cols]
                                 (let [id-or-name (or (:id col) (:name col))
                                       field-ref  (:field_ref col)]
                                   {::mb.viz/table-column-field-ref (or field-ref [:field id-or-name nil])
                                    ::mb.viz/table-column-enabled true})))
        enabled-table-cols (filter ::mb.viz/table-column-enabled table-columns')
        cols-vector        (into [] cols)
        cols-index         (reduce-kv (fn [m i col]
                                        (if-let [field-ref (:field_ref col)]
                                          ;; Use first two entries of field-ref, if available
                                          (assoc m (field-ref->map-key field-ref) i)
                                          ;; Otherwise construct a key using the name and/or id of the column
                                          (let [m' (assoc m [:field (:name col)] i)]
                                            (if (:id col)
                                              (assoc m' [:field (:id col)] i) m'))))
                                      {}
                                      cols-vector)]
    (->> (map
          (fn [{field-ref ::mb.viz/table-column-field-ref}]
            (let [index         (get cols-index (field-ref->map-key field-ref))
                  col           (get cols-vector index)
                  remapped-to   (:remapped_to col)
                  remapped-from (:remapped_from col)]
              (cond
                remapped-to
                (get cols-index [:field remapped-to])

                (not remapped-from)
                index)))
          enabled-table-cols)
         (remove nil?))))

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

(defn- streaming-rff [results-writer]
  (fn [{:keys [cols viz-settings] :as initial-metadata}]
    (let [[ordered-cols output-order] (order-cols cols viz-settings)
          viz-settings'               (assoc viz-settings :output-order output-order)
          row-count                   (volatile! 0)]
      (fn
        ([]
         (i/begin! results-writer
                   {:data (assoc initial-metadata :ordered-cols ordered-cols)}
                   viz-settings')
         {:data initial-metadata})

        ([metadata]
         (assoc metadata
                :row_count @row-count
                :status :completed))

        ([metadata row]
         (i/write-row! results-writer row (dec (vswap! row-count inc)) ordered-cols viz-settings')
         metadata)))))

(defn- streaming-reducedf [results-writer ^OutputStream os]
  (fn [_ final-metadata context]
    (i/finish! results-writer final-metadata)
    (u/ignore-exceptions
      (.flush os)
      (.close os))
    (context/resultf final-metadata context)))

(defn streaming-context
  "Context to pass to the QP to streaming results as `export-format` to an output stream. Can be used independently of
  the normal `streaming-response` macro, which is geared toward Ring responses.

    (with-open [os ...]
      (qp/process-query query (qp.streaming/streaming-context :csv os canceled-chan)))"
  ([export-format os]
   (let [results-writer (i/streaming-results-writer export-format os)]
     {:rff      (streaming-rff results-writer)
      :reducedf (streaming-reducedf results-writer os)}))

  ([export-format os canceled-chan]
   (assoc (streaming-context export-format os) :canceled-chan canceled-chan)))

(defn- await-async-result [out-chan canceled-chan]
  ;; if we get a cancel message, close `out-chan` so the query will be canceled
  (a/go
    (when (a/<! canceled-chan)
      (a/close! out-chan)))
  ;; block until `out-chan` closes or gets a result
  (a/<!! out-chan))

(defn streaming-response*
  "Impl for `streaming-response`."
  ^StreamingResponse [export-format filename-prefix f]
  (streaming-response/streaming-response (i/stream-options export-format filename-prefix) [os canceled-chan]
    (let [result (try
                   (f (streaming-context export-format os canceled-chan))
                   (catch Throwable e
                     e))
          result (if (instance? ManyToManyChannel result)
                   (await-async-result result canceled-chan)
                   result)]
      (when (or (instance? Throwable result)
                (= (:status result) :failed))
        (streaming-response/write-error! os result)))))

(defmacro streaming-response
  "Return results of processing a query as a streaming response. This response implements the appropriate Ring/Compojure
  protocols, so return or `respond` with it directly. Pass the provided `context` to your query processor function of
  choice. `export-format` is one of `:api` (for normal JSON API responses), `:json`, `:csv`, or `:xlsx` (for downloads).

  Typical example:

    (api/defendpoint GET \"/whatever\" []
      (qp.streaming/streaming-response [context :json]
        (qp/process-query-and-save-with-max-results-constraints! (assoc query :async true) context)))

  Handles either async or sync QP results, but you should prefer returning sync results so we can handle query
  cancelations properly."
  {:style/indent 1}
  [[context-binding export-format filename-prefix] & body]
  `(streaming-response* ~export-format ~filename-prefix (fn [~context-binding] ~@body)))

(defn export-formats
  "Set of valid streaming response formats. Currently, `:json`, `:csv`, `:xlsx`, and `:api` (normal JSON API results
  with extra metadata), but other types may be available if plugins are installed. (The interface is extensible.)"
  []
  (set (keys (methods i/stream-options))))
