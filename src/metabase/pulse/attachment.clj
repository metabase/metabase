(ns metabase.pulse.attachment
  (:require
   [clojure.java.io :as io]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [tru]])
  (:import
   (java.io File IOException OutputStream)))

(set! *warn-on-reflection* true)

(defn- create-temp-file
  "Separate from `create-temp-file-or-throw` primarily so that we can simulate exceptions in tests"
  [filename suffix]
  (doto (File/createTempFile filename (str "." suffix))
    .deleteOnExit))

(defn create-temp-file-or-throw
  "Tries to create a temp file, will give the users a better error message if we are unable to create the temp file"
  [filename suffix]
  (try
    (create-temp-file filename suffix)
    (catch IOException e
      (let [ex-msg (tru "Unable to create temp file in `{0}` for email attachments "
                        (System/getProperty "java.io.tmpdir"))]
        (throw (IOException. ex-msg e))))))

(defn text-file-writer
  "Writes given text to a file via the given output-stream."
  [output-stream ^String text]
  (let [writer (io/writer output-stream)]
    (.write writer text)
    (.flush writer)))

(defn- stream-api-results-to-export-format
  "For legacy compatibility. Takes QP results in the normal `:api` response format and streams them to a different
  format.

  TODO -- this function is provided mainly because rewriting all the Pulse/Alert code to stream results directly
  was a lot of work. I intend to rework that code so we can stream directly to the correct export format(s) at some
  point in the future; for now, this function is a stopgap.

  Results are streamed synchronously. Caller is responsible for closing `os` when this call is complete."
  [export-format ^OutputStream os {{:keys [rows]} :data, database-id :database_id, :as results}]
  ;; make sure Database/driver info is available for the streaming results writers -- they might need this in order to
  ;; get timezone information when writing results
  (driver/with-driver (driver.u/database->driver database-id)
    (qp.store/with-metadata-provider database-id
      (let [w                           (qp.si/streaming-results-writer export-format os)
            cols                        (-> results :data :cols)
            viz-settings                (-> results :data :viz-settings)
            [ordered-cols output-order] (qp.streaming/order-cols cols viz-settings)
            viz-settings'               (assoc viz-settings :output-order output-order)]
        (qp.si/begin! w
                      (assoc-in results [:data :ordered-cols] ordered-cols)
                      viz-settings')
        (dorun
         (map-indexed
          (fn [i row]
            (qp.si/write-row! w row i ordered-cols viz-settings'))
          rows))
        (qp.si/finish! w results)))))

(defn- create-result-attachment-map [export-type card-name ^File attachment-file]
  (let [{:keys [content-type]} (qp.si/stream-options export-type)]
    {:type         :attachment
     :content-type content-type
     :file-name    (format "%s_%s.%s"
                           (or (u/slugify card-name) "query_result")
                           (u.date/format (t/zoned-date-time))
                           (name export-type))
     :content      (-> attachment-file .toURI .toURL)
     :description  (format "More results for '%s'" card-name)}))

(defn result-attachment
  "Creates the result attachment maps for csv and xlsx files."
  [{{card-name :name :as card}        :card
    {{:keys [rows]} :data :as result} :result}]
  (when (seq rows)
    [(when-let [temp-file (and (:include_csv card)
                               (create-temp-file-or-throw "metabase_attachment" "csv"))]
       (with-open [os (io/output-stream temp-file)]
         (stream-api-results-to-export-format :csv os result))
       (create-result-attachment-map "csv" card-name temp-file))
     (when-let [temp-file (and (:include_xls card)
                               (create-temp-file-or-throw "metabase_attachment" "xlsx"))]
       (with-open [os (io/output-stream temp-file)]
         (stream-api-results-to-export-format :xlsx os result))
       (create-result-attachment-map "xlsx" card-name temp-file))]))
