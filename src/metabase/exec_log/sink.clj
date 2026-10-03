(ns metabase.exec-log.sink
  "Where execution-log records go. Three sinks behind one protocol, selected by
  [[metabase.exec-log.settings/exec-log-sink]]; the call site knows only [[emit-record!]].

  ## Two invariants, both load-bearing

  **Nothing invalid reaches a sink.** [[emit-record!]] validates against `metabase.exec-log.schema/record` and drops
  what fails, with an error logged. Validating on the way *out* is what lets the sidecar treat the file as
  proven-shaped: a consumer that reads a line does not have to re-derive the format, because a record that did not
  match never got written.

  **Nothing here can fail a query.** This runs inline on the query thread, so every path -- resolution, validation,
  encoding, the write itself -- is inside a `Throwable` catch that logs and returns nil. A full disk, an unwritable
  path, a record the schema rejects: all become a log line and nothing else. That is the design doc's SLO, not a
  nicety."
  (:require
   [clojure.java.io :as io]
   [metabase.exec-log.schema :as exec-log.schema]
   [metabase.exec-log.settings :as exec-log.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defprotocol EventSink
  "A destination for execution-log records. `record` has already been validated by [[emit-record!]]; an implementation
  may assume it matches `metabase.exec-log.schema/record`."
  (emit! [this record]
    "Write one record. Return value is ignored."))

;;; ------------------------------------------- noop -------------------------------------------

(defrecord ^:private NoopSink []
  EventSink
  (emit! [_this _record] nil))

(def noop-sink
  "The default sink: discards everything. Also the off switch -- selecting `:noop` stops emission without a restart."
  (->NoopSink))

;;; ------------------------------------------- memory -------------------------------------------

(defrecord ^:private MemorySink [records]
  EventSink
  (emit! [_this record]
    (swap! records conj record)
    nil))

(def memory-sink
  "In-process sink holding a vector of records. One instance, not one per resolution, so a test can read what
  production code emitted -- see [[memory-records]] and [[reset-memory-sink!]]."
  (->MemorySink (atom [])))

(defn memory-records
  "Records accumulated in [[memory-sink]], oldest first."
  []
  @(:records memory-sink))

(defn reset-memory-sink!
  "Drop everything [[memory-sink]] has accumulated."
  []
  (reset! (:records memory-sink) [])
  nil)

;;; ------------------------------------------- file -------------------------------------------

(defrecord ^:private FileSink [path]
  EventSink
  (emit! [_this record]
    ;; Open/append/flush per record. Deliberately the dumb version: a writer pool would need lifecycle management and
    ;; a rotation story (MON-11) that is not decided yet, and `with-open` cannot lose a record to a half-flushed
    ;; buffer on shutdown.
    (with-open [w (io/writer (io/file path) :append true)]
      (.write w (json/encode record))
      (.write w "\n"))
    nil))

;;; ------------------------------------------- resolution -------------------------------------------

(defn- build-sink
  "The sink named by `sink-kind`, or [[noop-sink]] when the name is unknown or the file sink has no path configured.
  Falling back to noop rather than throwing: a typo in a setting must not break queries."
  [sink-kind]
  (case sink-kind
    :noop   noop-sink
    :memory memory-sink
    :file   (if-let [path (exec-log.settings/exec-log-file)]
              (->FileSink path)
              (do
                (log/warn "exec-log-sink is :file but exec-log-file is not set; discarding execution-log records")
                noop-sink))
    (do
      (log/warnf "Unknown exec-log-sink %s; discarding execution-log records" (pr-str sink-kind))
      noop-sink)))

(def ^:private resolved-sink
  "Cache of `[sink-kind file-path] -> sink`, so the common case does not rebuild a sink per record. Keyed on the
  setting values rather than memoized on nothing, so flipping a setting takes effect on the next record."
  (atom nil))

(defn- current-sink
  "The configured sink, rebuilt only when the settings behind it change."
  []
  (let [k [(exec-log.settings/exec-log-sink) (exec-log.settings/exec-log-file)]]
    (or (get @resolved-sink k)
        (let [sink (build-sink (first k))]
          (reset! resolved-sink {k sink})
          sink))))

;;; ------------------------------------------- entry point -------------------------------------------

(defn- drop-reasons
  "The paths and types of a validation failure, without the offending values.

  Deliberately drops `:value`. A malformed record can carry an IP address and a user agent, and `:request` exists so
  those are gated on `analytics-pii-retention-enabled`; logging the whole record on a validation failure would route
  them into the application log, which has a different retention regime and no such gate. The path and the error type
  say what is wrong; the value is what would leak."
  [explanation]
  (mapv (fn [{:keys [in type]}] {:in in, :type type})
        (:errors explanation)))

(defn emit-record!
  "Validate `record` and hand it to the configured sink. The only thing a caller needs.

  Returns nil always, and never throws: an invalid record is logged and dropped, and any failure inside the sink is
  logged and swallowed. Called on the query thread -- see the namespace docstring."
  [record]
  (try
    (if-let [explanation (mr/explain ::exec-log.schema/record record)]
      (log/errorf "Dropping malformed execution-log record; topic %s, errors: %s"
                  (pr-str (:topic record))
                  (pr-str (drop-reasons explanation)))
      (emit! (current-sink) record))
    (catch Throwable e
      (log/error e "Error emitting execution-log record")))
  nil)
