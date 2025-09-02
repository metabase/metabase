(ns metabase-enterprise.transforms.instrumentation
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::stage-type
  [:enum :data-transfer :computation :sync])

(mr/def ::stage-label
  [:enum
   ;; Data transfer stages
   :dwh-to-file
   :file-to-s3
   :file-to-dwh

   ;; Python execution stages
   :python-execution

   ;; MBQL execution stages
   :mbql-query

   ;; Sync stages
   :table-sync

   ;; File operations
   :csv-write])

(mu/defn record-stage-start!
  "Record the start of a transform stage."
  [job-run-id      :- pos-int?
   transform-id    :- pos-int?
   stage-type      :- ::stage-type
   stage-label     :- ::stage-label]
  (prometheus/inc! :metabase-transforms/stage-started
                   {:job-run-id (str job-run-id)
                    :transform-id (str transform-id)
                    :stage-type (name stage-type)
                    :stage-label (name stage-label)}))

(mu/defn record-stage-completion!
  "Record the successful completion of a transform stage."
  [job-run-id      :- pos-int?
   transform-id    :- pos-int?
   stage-type      :- ::stage-type
   stage-label     :- ::stage-label
   duration-ms     :- pos-int?]
  (let [labels {:job-run-id (str job-run-id)
                :transform-id (str transform-id)
                :stage-type (name stage-type)
                :stage-label (name stage-label)}]
    (prometheus/inc! :metabase-transforms/stage-completed labels)
    (prometheus/observe! :metabase-transforms/stage-duration-ms labels duration-ms)))

(mu/defn record-stage-failure!
  "Record the failure of a transform stage."
  [job-run-id      :- pos-int?
   transform-id    :- pos-int?
   stage-type      :- ::stage-type
   stage-label     :- ::stage-label
   duration-ms     :- [:maybe pos-int?]]
  (let [labels {:job-run-id (str job-run-id)
                :transform-id (str transform-id)
                :stage-type (name stage-type)
                :stage-label (name stage-label)}]
    (prometheus/inc! :metabase-transforms/stage-failed labels)
    (when duration-ms
      (prometheus/observe! :metabase-transforms/stage-duration-ms labels duration-ms))))

(defmacro with-stage-timing
  "Execute body while timing a transform stage. Automatically records start, completion or failure.

   Usage:
   (with-stage-timing [job-run-id transform-id :data-transfer :dwh-to-file]
     ;; stage implementation
     result)"
  [[job-run-id transform-id stage-type stage-label] & body]
  `(let [start-time# (System/currentTimeMillis)]
     (record-stage-start! ~job-run-id ~transform-id ~stage-type ~stage-label)
     (try
       (let [result# (do ~@body)]
         (record-stage-completion! ~job-run-id ~transform-id ~stage-type ~stage-label
                                   (- (System/currentTimeMillis) start-time#))
         result#)
       (catch Throwable t#
         (record-stage-failure! ~job-run-id ~transform-id ~stage-type ~stage-label
                                (- (System/currentTimeMillis) start-time#))
         (throw t#)))))

(mu/defn record-data-transfer!
  "Record metrics about data transfer (size and rows)."
  [job-run-id      :- pos-int?
   transform-id    :- pos-int?
   stage-label     :- ::stage-label
   bytes           :- [:maybe pos-int?]
   rows            :- [:maybe pos-int?]]
  (let [labels {:job-run-id (str job-run-id)
                :transform-id (str transform-id)
                :stage-label (name stage-label)}]
    (when bytes
      (prometheus/observe! :metabase-transforms/data-transfer-bytes labels bytes))
    (when rows
      (prometheus/observe! :metabase-transforms/data-transfer-rows labels rows))))

(defn record-job-start!
  "Record the start of a transform job run."
  [job-id run-method]
  (prometheus/inc! :metabase-transforms/job-runs-total
                   {:job-id (str job-id)
                    :run-method (name run-method)}))

(defn record-job-completion!
  "Record the successful completion of a transform job run."
  [job-id run-method duration-ms]
  (let [labels {:job-id (str job-id)
                :run-method (name run-method)}]
    (prometheus/inc! :metabase-transforms/job-runs-completed labels)
    (prometheus/observe! :metabase-transforms/job-run-duration-ms labels duration-ms)))

(defn record-job-failure!
  "Record the failure of a transform job run."
  [job-id run-method duration-ms]
  (let [labels {:job-id (str job-id)
                :run-method (name run-method)}]
    (prometheus/inc! :metabase-transforms/job-runs-failed labels)
    (when duration-ms
      (prometheus/observe! :metabase-transforms/job-run-duration-ms labels duration-ms))))

(defmacro with-job-timing
  "Execute body while timing a transform job run. Automatically records start, completion or failure.

   Usage:
   (with-job-timing [job-id run-method]
     ;; job implementation
     result)"
  [[job-id run-method] & body]
  `(let [start-time# (System/currentTimeMillis)]
     (record-job-start! ~job-id ~run-method)
     (try
       (let [result# (do ~@body)]
         (record-job-completion! ~job-id ~run-method
                                 (- (System/currentTimeMillis) start-time#))
         result#)
       (catch Throwable t#
         (record-job-failure! ~job-id ~run-method
                              (- (System/currentTimeMillis) start-time#))
         (throw t#)))))

(mr/def ::api-call-status [:enum :success :error :timeout])

(mu/defn record-python-api-call!
  "Record metrics about Python API calls."
  [job-run-id      :- pos-int?
   transform-id    :- pos-int?
   duration-ms     :- pos-int?
   status          :- ::api-call-status]
  (let [labels {:job-run-id (str job-run-id)
                :transform-id (str transform-id)}]
    (prometheus/inc! :metabase-transforms/python-api-calls-total
                     (assoc labels :status (name status)))
    (prometheus/observe! :metabase-transforms/python-api-call-duration-ms labels duration-ms)))

(defmacro with-python-api-timing
  "Execute body while timing a Python API call."
  [[job-run-id transform-id] & body]
  `(let [start-time# (System/currentTimeMillis)]
     (try
       (let [result# (do ~@body)]
         (record-python-api-call! ~job-run-id ~transform-id
                                  (- (System/currentTimeMillis) start-time#)
                                  :success)
         result#)
       (catch Throwable t#
         (record-python-api-call! ~job-run-id ~transform-id
                                  (- (System/currentTimeMillis) start-time#)
                                  :error)
         (throw t#)))))

(defn record-csv-write-operation!
  "Record metrics about CSV file write operations."
  [job-run-id transform-id duration-ms]
  (prometheus/observe! :metabase-transforms/csv-write-duration-ms
                       {:job-run-id (str job-run-id)
                        :transform-id (str transform-id)}
                       duration-ms))

(defmacro with-csv-write-timing
  "Execute body while timing a CSV file write operation."
  [[job-run-id transform-id] & body]
  `(let [start-time# (System/currentTimeMillis)]
     (let [result# (do ~@body)]
       (record-csv-write-operation! ~job-run-id ~transform-id
                                    (- (System/currentTimeMillis) start-time#))
       result#)))
