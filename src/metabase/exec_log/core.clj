(ns metabase.exec-log.core
  "Public API for the execution-log stream.

  Emits one record per userland query execution onto a pluggable sink, for an external consumer to read. The stream is
  observe-only: nothing here can affect query execution, and every failure path logs and continues.

  Callers need exactly one function, [[record-query-execution!]]. The wire format lives
  in [[metabase.exec-log.schema]] and is versioned; see that namespace for the rule governing when the version moves."
  (:require
   [metabase.exec-log.record :as exec-log.record]
   [metabase.exec-log.settings :as exec-log.settings]
   [metabase.exec-log.sink :as exec-log.sink]
   [metabase.util.log :as log]
   [potemkin :as p]))

(comment exec-log.settings/keep-me)

(p/import-vars
 [exec-log.settings
  exec-log-sink
  exec-log-file])

(defn enabled?
  "Whether anything is listening. Lets a caller skip building a record when the sink is off, which is the default."
  []
  (not= :noop (exec-log.settings/exec-log-sink)))

(defn record-query-execution!
  "Emit one `:query-executed` record for an enriched QueryExecution map.

  `pii?` is whether PII retention is on. The caller reads it rather than this namespace, because it must be read on
  the query thread while the request is still in scope -- the same reason `include-sdk-info` runs there.

  Returns nil always and never throws. Called from the query path, so a failure here must not be able to fail a
  user's query."
  [execution-info {:keys [pii? instance-id]}]
  (try
    (when (enabled?)
      (exec-log.sink/emit-record!
       (exec-log.record/->record execution-info {:pii? pii?, :instance-id instance-id})))
    (catch Throwable e
      ;; `emit-record!` already logs and swallows its own failures; this catch covers record construction, which
      ;; reads a map whose shape comes from the QP and could surprise us. Log the exception but not the map: an
      ;; execution-info map carries an IP address and a user agent, and the application log has neither the retention
      ;; regime nor the gate that `:request` exists to enforce.
      (log/error e "Error building execution-log record")))
  nil)
