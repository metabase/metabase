(ns metabase.query-processor.streaming.json
  "Impls for JSON-based QP streaming response types. `:json` streams a simple array of maps as opposed to the full
  response with all the metadata for `:api`."
  (:refer-clojure :exclude [mapv])
  (:require
   [medley.core :as m]
   [metabase.formatter.core :as formatter]
   [metabase.pivot.postprocess :as pivot.postprocess]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util.json :as json]
   [metabase.util.performance :refer [mapv]])
  (:import
   (java.io BufferedOutputStream OutputStream)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- write-ascii! [^OutputStream os ^String s]
  (.write os (.getBytes s StandardCharsets/US_ASCII)))

(defmethod qp.si/stream-options :json
  ([_]
   (qp.si/stream-options :json "query_result"))
  ([_ filename-prefix]
   {:content-type "application/json; charset=utf-8"
    :status       200
    :headers      {"Content-Disposition" (format "attachment; filename=\"%s_%s.json\""
                                                 (or filename-prefix "query_result")
                                                 (streaming.common/export-filename-timestamp))}}))

(defmethod qp.si/streaming-results-writer :json
  [_ ^OutputStream os]
  (let [out                (BufferedOutputStream. os)
        col-names          (volatile! nil)
        ordered-formatters (volatile! nil)
        ;; if we're processing results from a pivot query, there will be a column 'pivot-grouping' that we don't want to include
        ;; in the final results, so we get the idx into the row in order to remove it
        pivot-grouping-idx (volatile! nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows?]
                   :or   {format-rows? true}} :data} viz-settings]
        (let [cols           (streaming.common/column-titles ordered-cols viz-settings format-rows?)
              pivot-grouping (pivot.postprocess/pivot-grouping-index cols)]
          (when pivot-grouping (vreset! pivot-grouping-idx pivot-grouping))
          (let [names (cond->> cols
                        pivot-grouping (m/remove-nth pivot-grouping))]
            (vreset! col-names names))
          (vreset! ordered-formatters
                   (mapv #(formatter/create-formatter results_timezone % viz-settings format-rows?) ordered-cols))
          (write-ascii! out "[\n")))

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
                    (= pivot.postprocess/non-pivot-row-group (int group)))
            (when-not (zero? row-num)
              (write-ascii! out ",\n"))
            (json/encode-to
             ;; #12247 Use array-map instead of zipmap for preserving order in json export
             (apply array-map
                    (interleave
                     @col-names
                     (map (fn [formatter r]
                            ;; NOTE: Stringification of formatted values ensures consistency with what is shown in the
                            ;; Metabase UI, especially numbers (e.g. percents, currencies, and rounding). However, this
                            ;; does mean that all JSON values are strings. Any other strategy requires some level of
                            ;; inference to know if we should or should not parse a string (or not stringify an object).
                            (let [res (formatter (streaming.common/format-value r))]
                              (cond
                                (formatter/NumericWrapper? res) (:num-str res)
                                (formatter/TextWrapper? res)    (:text-str res)
                                :else                          res)))
                          @ordered-formatters cleaned-row)))
             out {}))))
      ;; no flush per row: it would sync-flush the GZIP response per row (one native Deflater call each, TCP packet
      ;; overhead per #34795); the BufferedOutputStream pushes rows through as it fills, like the CSV writer

      (finish! [_ _]
        (write-ascii! out "\n]")
        (.flush out)
        (.close out)))))

(defmethod qp.si/stream-options :api
  ([_]   (qp.si/stream-options :api nil))
  ([_ _] {:content-type "application/json; charset=utf-8"}))

(defn- write-map-entries!
  "Write the entries of `maplike` as JSON object members, each preceded by a comma: they follow other members."
  [^OutputStream out maplike]
  (doseq [[k v] maplike]
    (write-ascii! out ",")
    (json/encode-to (if (keyword? k) (subs (str k) 1) (str k)) out {})
    (write-ascii! out ":")
    (json/encode-to v out {})))

(defmethod qp.si/streaming-results-writer :api
  [_ ^OutputStream os]
  ;; The metadata that arrives in `finish!` adds new keys to both the `:data` and outer maps, so the response can't
  ;; be generated from a single value: write its structure by hand around the rows instead.

  ;; Rows are not flushed as they are written: that would send 3 + N packets over the wire, where N is the number of
  ;; rows in the response! That's a lot of TCP overhead, which causes download time slowdowns, especially with
  ;; complex load balancing etc. See #34795.
  (let [out (BufferedOutputStream. os)
        first-row? (volatile! true)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ _ _]
        (write-ascii! out "{\"data\":{\"rows\":["))

      (write-row! [_ row _ _ _]
        (if @first-row?
          (vreset! first-row? false)
          (write-ascii! out ","))
        (json/encode-to row out {}))

      (finish! [_ {:keys [data], :as metadata}]
        (write-ascii! out "]")
        ;; write any remaining keys in data
        (write-map-entries! out data)
        ;; close data
        (write-ascii! out "}")
        ;; write any remaining top-level keys
        (write-map-entries! out (dissoc metadata :data))
        ;; close top-level map
        (write-ascii! out "}")
        (.flush out)
        (.close out)))))
