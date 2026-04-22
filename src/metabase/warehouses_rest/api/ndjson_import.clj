(ns metabase.warehouses-rest.api.ndjson-import
  "Streaming NDJSON-import infrastructure shared by the POST endpoints in
  `metabase.warehouses-rest.api`. Handles request body parsing, per-batch transactional
  processing, response body streaming, and exception classification into a contract-shaped
  error NDJSON line. See `METADATA_IMPORT_API_CONTRACT.md` for the shape of the response."
  (:require
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io BufferedReader BufferedWriter InputStream InputStreamReader OutputStream OutputStreamWriter Writer)
   (java.nio.charset StandardCharsets)
   (java.sql SQLException)
   (java.util ArrayList)))

(set! *warn-on-reflection* true)

(def content-type
  "Content-Type for NDJSON request and response bodies."
  "application/x-ndjson; charset=utf-8")

(defn- unique-violation?
  "True if `e` or any cause is a SQL unique-constraint violation. Handles Postgres and H2 via
  SQLState \"23505\" (SQL:2003 standard) and MySQL/MariaDB via SQLState \"23000\" + vendor error
  code 1062."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? SQLException cause)
      (let [sql-ex ^SQLException cause]
        (or (case (.getSQLState sql-ex)
              "23505" true
              "23000" (= 1062 (.getErrorCode sql-ex))
              false)
            (recur (.getCause cause))))
      :else (recur (.getCause cause)))))

(defn- request-reader
  "Wrap a request `:body` `InputStream` in a UTF-8 `BufferedReader`. Returns nil if `body` is nil.
  Caller must close the returned reader."
  ^BufferedReader [^InputStream body]
  (when body
    (BufferedReader. (InputStreamReader. body StandardCharsets/UTF_8))))

(defn- write-line!
  "Write a single JSON record to `writer` followed by `\\n`."
  [^Writer writer record]
  (json/encode-to record writer {})
  (.write writer "\n"))

(defn- response-writer
  "Wrap the streaming-response `OutputStream` in a `BufferedWriter` for writing NDJSON lines."
  ^BufferedWriter [^OutputStream os]
  (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8)))

(defn bad-input!
  "Throw an `ex-info` with `:kind :invalid_input` for a required field that's missing or of the
  wrong type."
  [line-num field-name detail & extras]
  (throw (ex-info (format "invalid_input: %s" field-name)
                  (apply hash-map
                         :kind :invalid_input
                         :line line-num
                         :detail detail
                         extras))))

(defn- parse-line!
  "Parse one NDJSON line. On malformed JSON, throws an `ex-info` with `:kind :malformed_json` and
  the 1-indexed `:line` number of the bad input."
  [line-num ^String line]
  (try
    (json/decode+kw line)
    (catch Throwable e
      (throw (ex-info "malformed_json"
                      {:kind :malformed_json
                       :line line-num
                       :detail (.getMessage e)})))))

(defn- numbered-lines
  "Sequence of `[line-num raw-line]` pairs for the request body. Blank lines are skipped; the
  line number is the 1-indexed position of the raw line in the request body (including blanks),
  so error reports point at the user's literal line in the file."
  [^BufferedReader reader]
  (keep-indexed (fn [idx ^String s]
                  (when (and s (not (zero? (.length s))))
                    [(inc idx) s]))
                (line-seq reader)))

(defn- parsed-batches
  "Lazy seq of batches of `[line-num parsed-map]` pairs, each batch up to `batch-size` lines.
  Malformed lines throw via `parse-line!`."
  [^BufferedReader reader batch-size]
  (->> (numbered-lines reader)
       (map (fn [[n raw]] [n (parse-line! n raw)]))
       (partition-all batch-size)))

(defn- error-line
  "Build the final error NDJSON record. `kind` is a keyword naming the failure category (e.g.
  `:invalid_input`, `:no_match`, `:unique_violation`, `:server_error`); `line-num` is the
  1-indexed source line (or nil if not knowable); `extras` is merged in for the echo key
  (`old_id`, `id`, `field_id`) when it's unambiguously knowable."
  [kind line-num detail extras]
  (merge {:error (name kind) :detail (or detail "")}
         (when line-num {:line line-num})
         extras))

(def ^:private echo-keys
  "Keys we allow through from an `ex-info`'s `ex-data` to the error line as echo fields."
  #{:old_id :id :field_id})

(defn- classify-throwable
  "Return the error NDJSON record for a caught throwable. `ExceptionInfo` with a `:kind` in its
  ex-data was thrown by a validation or lookup site here and carries its own `:line` and
  echo-key extras — those pass through. Anything else is classified by walking the cause chain:
  `unique-violation?` matches become `:unique_violation`, everything else becomes `:server_error`."
  [^Throwable t]
  (let [data (when (instance? ExceptionInfo t) (ex-data t))
        kind (:kind data)]
    (cond
      (keyword? kind)
      (error-line kind (:line data) (or (:detail data) (.getMessage t))
                  (select-keys data echo-keys))

      (unique-violation? t)
      (error-line :unique_violation nil (.getMessage t) nil)

      :else
      (error-line :server_error nil (.getMessage t) nil))))

(defn wrap-row-error
  "Tag an exception from a per-row processor with `:line` and an echo key so the error NDJSON line
  points at the offending row. Already-classified `ExceptionInfo` (one with `:kind` in ex-data)
  passes through unchanged — it already has its line and echo extras from the throw site.
  Anything else is wrapped as `ex-info` with `:kind` pre-classified via `unique-violation?`."
  [^Throwable e line-num echo-extras]
  (let [data (when (instance? ExceptionInfo e) (ex-data e))]
    (if (:kind data)
      e
      (ex-info (.getMessage e)
               (merge echo-extras
                      {:kind   (if (unique-violation? e) :unique_violation :server_error)
                       :line   line-num
                       :detail (.getMessage e)})
               e))))

(defn stream-import!
  "Shared driver for streaming NDJSON imports. `process-batch!` is called once per batch with
  `[batch buffer]` where `batch` is a seq of `[line-num parsed-map]` pairs and `buffer` is a
  `java.util.ArrayList` that the processor pushes response maps into. On success the buffer is
  drained to the response writer after the batch's transaction commits. On any throwable the
  batch's transaction rolls back (via rethrow), the buffer is discarded, one final error line
  is written via `classify-throwable`, and the response closes cleanly. `batch-size` caps the
  number of rows held in one transaction."
  [^InputStream in ^OutputStream out batch-size process-batch!]
  (with-open [reader (request-reader in)
              writer (response-writer out)]
    (try
      (doseq [batch (parsed-batches reader batch-size)]
        (let [buffer (ArrayList.)]
          (t2/with-transaction [_conn]
            (process-batch! batch buffer))
          (doseq [record buffer]
            (write-line! writer record))
          (.flush writer)))
      (catch Throwable t
        (log/debugf t "NDJSON import failed")
        (write-line! writer (classify-throwable t))
        (.flush writer)))))
