(ns metabase-enterprise.transforms.instrumentation
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::stage-type
  [:enum :export :computation :import])

(def ^:private label-to-stage
  {:dwh-to-file      :export
   :file-to-s3       :export
   :file-to-dwh      :import
   :python-execution :computation
   :mbql-sync        :computation
   :table-sync       :import})

(mr/def ::stage-label
  [:enum
   :dwh-to-file
   :file-to-s3
   :file-to-dwh

   :python-execution
   :mbql-query
   :table-sync])

(mu/defn record-stage-start!
  "Record the start of a transform stage."
  [job-run-id :- pos-int?
   stage-label :- ::stage-label]
  (let [stage-type (label-to-stage stage-label)]
    (log/infof "Transform stage started: run-id=%d type=%s label=%s" job-run-id (name stage-type) (name stage-label))
    (prometheus/inc! :metabase-transforms/stage-started
                     {:job-run-id (str job-run-id)
                      :stage-type (name stage-type)
                      :stage-label (name stage-label)})))

(mu/defn record-stage-completion!
  "Record the successful completion of a transform stage."
  [job-run-id :- pos-int?
   stage-label :- ::stage-label
   duration-ms :- int?]
  (let [stage-type (label-to-stage stage-label)]
    (log/infof "Transform stage completed: run-id=%d type=%s label=%s duration=%dms" job-run-id (name stage-type) (name stage-label) duration-ms)
    (let [labels {:job-run-id (str job-run-id)
                  :stage-type (name stage-type)
                  :stage-label (name stage-label)}]
      (prometheus/inc! :metabase-transforms/stage-completed labels)
      (prometheus/observe! :metabase-transforms/stage-duration-ms labels duration-ms))))

(mu/defn record-stage-failure!
  "Record the failure of a transform stage."
  [job-run-id :- pos-int?
   stage-label :- ::stage-label
   duration-ms :- int?]
  (let [stage-type (label-to-stage stage-label)]
    (log/warnf "Transform stage failed: run-id=%d type=%s label=%s duration=%s" job-run-id (name stage-type) (name stage-label) (str duration-ms "ms"))
    (let [labels {:job-run-id (str job-run-id)
                  :stage-type (name stage-type)
                  :stage-label (name stage-label)}]
      (prometheus/inc! :metabase-transforms/stage-failed labels)
      (when duration-ms
        (prometheus/observe! :metabase-transforms/stage-duration-ms labels duration-ms)))))

(defn with-timing
  "Generic timing function that executes body while recording metrics.

   Takes a map of optional functions:
   - :start-fn - function to call when starting
   - :success-fn - function to call on success (receives duration-ms as last arg)
   - :error-fn - function to call on error (receives duration-ms as last arg)

   Usage:
   (with-timing {:start-fn #(record-stage-start! %1 %3)
                 :success-fn #(record-stage-completion! %1 %2 %3)
                 :error-fn #(record-stage-failure! %1 %2 %3)}
                [job-run-id stage-label]
                #(do-work)) "
  [callbacks args body-fn]
  (let [start-time (u/start-timer)]
    (when-let [start-fn (:start-fn callbacks)]
      (apply start-fn args))
    (try
      (let [result (body-fn)]
        (when-let [success-fn (:success-fn callbacks)]
          (apply success-fn (conj (vec args) (long (u/since-ms start-time)))))
        result)
      (catch Throwable t
        (when-let [error-fn (:error-fn callbacks)]
          (apply error-fn (conj (vec args) (long (u/since-ms start-time)))))
        (throw t)))))

(defmacro with-stage-timing
  "Execute body while timing a transform stage. Automatically records start, completion or failure.

   Usage:
   (with-stage-timing [job-run-id :dwh-to-file]
     ;; stage implementation
     result)"
  [args & body]
  `(with-timing {:start-fn record-stage-start!
                 :success-fn record-stage-completion!
                 :error-fn record-stage-failure!}
     ~args
     (^:once fn* [] ~@body)))

(mu/defn record-data-transfer!
  "Record metrics about data transfer (size and rows)."
  [job-run-id :- pos-int?
   stage-label :- ::stage-label
   bytes :- [:maybe int?]
   rows :- [:maybe int?]]
  (if (and (nil? bytes) (nil? rows))
    (log/warnf "Data transfer recorded: run-id=%d stage=%s but no bytes or rows provided"
               job-run-id
               (name stage-label))
    (log/infof "Data transfer recorded: run-id=%d stage=%s%s%s"
               job-run-id
               (name stage-label)
               (if bytes (str " bytes=" bytes) "")
               (if rows (str " rows=" rows) "")))
  (let [labels {:job-run-id (str job-run-id)
                :stage-label (name stage-label)}]
    (when bytes
      (prometheus/observe! :metabase-transforms/data-transfer-bytes labels bytes))
    (when rows
      (prometheus/observe! :metabase-transforms/data-transfer-rows labels rows))))

(defn record-job-start!
  "Record the start of a transform job run."
  [job-id run-method]
  (log/infof "Transform job started: job-id=%d run-method=%s" job-id (name run-method))
  (prometheus/inc! :metabase-transforms/job-runs-total
                   {:job-id (str job-id)
                    :run-method (name run-method)}))

(defn record-job-completion!
  "Record the successful completion of a transform job run."
  [job-id run-method duration-ms]
  (log/infof "Transform job completed: job-id=%d run-method=%s duration=%dms" job-id (name run-method) duration-ms)
  (let [labels {:job-id (str job-id)
                :run-method (name run-method)}]
    (prometheus/inc! :metabase-transforms/job-runs-completed labels)
    (prometheus/observe! :metabase-transforms/job-run-duration-ms labels duration-ms)))

(defn record-job-failure!
  "Record the failure of a transform job run."
  [job-id run-method duration-ms]
  (log/warnf "Transform job failed: job-id=%d run-method=%s duration=%dms" job-id (name run-method) duration-ms)
  (let [labels {:job-id (str job-id)
                :run-method (name run-method)}]
    (prometheus/inc! :metabase-transforms/job-runs-failed labels)
    (prometheus/observe! :metabase-transforms/job-run-duration-ms labels duration-ms)))

(defmacro with-job-timing
  "Execute body while timing a transform job run. Automatically records start, completion or failure.

   Usage:
   (with-job-timing [job-id run-method]
     ;; job implementation
     result)"
  [[job-id run-method] & body]
  `(with-timing {:start-fn record-job-start!
                 :success-fn record-job-completion!
                 :error-fn record-job-failure!}
     [~job-id ~run-method]
     (^:once fn* [] ~@body)))

(mu/defn record-python-api-call!
  "Record metrics about Python API calls."
  [job-run-id :- pos-int?
   duration-ms :- int?
   status :- [:enum :success :error :timeout]]
  (log/infof "Python API call %s: run-id=%d duration=%dms" (name status) job-run-id duration-ms)
  (let [labels {:job-run-id (str job-run-id)}]
    (prometheus/inc! :metabase-transforms/python-api-calls-total
                     (assoc labels :status (name status)))
    (prometheus/observe! :metabase-transforms/python-api-call-duration-ms labels duration-ms)))

(defmacro with-python-api-timing
  "Execute body while timing a Python API call."
  [[job-run-id] & body]
  `(with-timing {:success-fn (fn [job-run-id# duration-ms#]
                               (record-python-api-call! job-run-id# duration-ms# :success))
                 :error-fn (fn [job-run-id# duration-ms#]
                             (record-python-api-call! job-run-id# duration-ms# :error))}
     [~job-run-id]
     (^:once fn* [] ~@body)))
