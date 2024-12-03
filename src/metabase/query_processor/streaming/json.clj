(ns metabase.query-processor.streaming.json
  "Impls for JSON-based QP streaming response types. `:json` streams a simple array of maps as opposed to the full
  response with all the metadata for `:api`."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defmethod qp.si/stream-options :json
  ([_]
   (qp.si/stream-options :json "query_result"))
  ([_ filename-prefix]
   {:content-type "application/json; charset=utf-8"
    :status       200
    :headers      {"Content-Disposition" (format "attachment; filename=\"%s_%s.json\""
                                                 (or filename-prefix "query_result")
                                                 (u.date/format (t/zoned-date-time)))}}))

(defmethod qp.si/streaming-results-writer :json
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        col-names          (volatile! nil)
        ordered-formatters (volatile! nil)
        ;; if we're processing results from a pivot query, there will be a column 'pivot-grouping' that we don't want to include
        ;; in the final results, so we get the idx into the row in order to remove it
        pivot-grouping-idx (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows?]
                   :or   {format-rows? true}} :data} viz-settings]
        (let [cols           (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?)
              pivot-grouping (qp.pivot.postprocess/pivot-grouping-key cols)]
          (when pivot-grouping (vreset! pivot-grouping-idx pivot-grouping))
          (let [names (cond->> cols
                        pivot-grouping (m/remove-nth pivot-grouping))]
            (vreset! col-names names))
          (vreset! ordered-formatters
                   (mapv #(formatter/create-formatter results_timezone % viz-settings format-rows?) ordered-cols))
          (.write writer "[\n")))

      (write-row! [_ row row-num _ {:keys [output-order]}]
        (let [ordered-row        (vec
                                  (if output-order
                                    (let [row-v (into [] row)]
                                      (for [i output-order] (row-v i)))
                                    row))
              pivot-grouping-key @pivot-grouping-idx
              group              (get ordered-row pivot-grouping-key)
              cleaned-row        (cond->> ordered-row
                                   pivot-grouping-key (m/remove-nth pivot-grouping-key))]
          ;; when a pivot-grouping col exists, we check its group number. When it's zero,
          ;; we keep it, otherwise don't include it in the results as it's a row representing a subtotal of some kind
          (when (or (not group)
                    (= qp.pivot.postprocess/NON_PIVOT_ROW_GROUP (int group)))
            (when-not (zero? row-num)
              (.write writer ",\n"))
            (json/encode-to
             (zipmap
              @col-names
              (map (fn [formatter r]
                     ;; NOTE: Stringification of formatted values ensures consistency with what is shown in the
                     ;; Metabase UI, especially numbers (e.g. percents, currencies, and rounding). However, this
                     ;; does mean that all JSON values are strings. Any other strategy requires some level of
                     ;; inference to know if we should or should not parse a string (or not stringify an object).
                     (let [res (formatter (common/format-value r))]
                       (if-some [num-str (:num-str res)]
                         num-str
                         res)))
                   @ordered-formatters cleaned-row))
             writer {})
            (.flush writer))))

      (finish! [_ _]
        (.write writer "\n]")
        (.flush writer)
        (.flush os)
        (.close writer)))))

(defmethod qp.si/stream-options :api
  ([_]   (qp.si/stream-options :api nil))
  ([_ _] {:content-type "application/json; charset=utf-8"}))

(defn- generate-map-contents [^JsonGenerator jgen maplike]
  (reduce (fn [^JsonGenerator jg kv]
            (let [k (key kv)
                  v (val kv)]
              (.writeFieldName jg (if (keyword? k)
                                    (subs (str k) 1)
                                    (str k)))
              (json/generate jg v json/default-date-format nil nil)
              jg))
          jgen maplike))

(defn- make-generator ^JsonGenerator [^OutputStream os]
  (-> os
      (OutputStreamWriter. StandardCharsets/UTF_8)
      (BufferedWriter.)
      json/create-generator))

(defmethod qp.si/streaming-results-writer :api
  [_ ^OutputStream os]
  ;; Cheshire supports a custom encoding API that we would like to use for streaming, say by generating JSON on
  ;; `{:data {:rows (a/chan), ...}}` and having a custom encoder for the channel.
  ;; But there's a problem: the `metadata that arrives in `finish!` adds new keys to both the `:data` and outer maps,
  ;; and there's no way to handle that mutation with a custom encoder.

  ;; So instead we would like to use Cheshire's streaming generator API. But it is very eager to `(.flush writer)`.
  ;; That results in sending 3 + N packets over the wire, where N is the number of rows in the response! That's a lot
  ;; of TCP overhead, which causes download time slowdowns, especially with complex load balancing etc. See #34795.

  ;; And so that leads to this low-level code that mixes calls to the underlying Jackson Java library with calls to
  ;; Cheshire's streaming API for handling Clojure data. It duplicates some Cheshire logic for generating maps, since
  ;; Cheshire doesn't have an API which generate in key-value pairs of a map without including the `{}`s.
  (let [jgen (make-generator os)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ _ _]
        (doto jgen
          (.writeStartObject)
          (.writeFieldName "data")
          (.writeStartObject)
          (.writeFieldName "rows")
          (.writeStartArray)))

      (write-row! [_ row _ _ _]
        (json/generate jgen row json/default-date-format nil nil))

      (finish! [_ {:keys [data], :as metadata}]
        (.writeEndArray jgen)
        ;; write any remaining keys in data
        (when-not (empty? data)
          (generate-map-contents jgen data))
        ;; close data
        (.writeEndObject jgen)
        ;; write any remaining top-level keys
        (when-let [other-metadata (not-empty (dissoc metadata :data))]
          (generate-map-contents jgen other-metadata))
        ;; close top-level map
        (doto jgen
          (.writeEndObject)
          (.flush)
          (.close))))))
