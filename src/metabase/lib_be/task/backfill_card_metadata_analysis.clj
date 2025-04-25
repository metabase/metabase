(ns metabase.lib-be.task.backfill-card-metadata-analysis
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :refer [defsetting]]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.lib-be.task.backfill-card-metadata-analysis.job")
(def ^:private trigger-key "metabase.lib-be.task.backfill-card-metadata-analysis.trigger")

(def ^:dynamic *batch-size*
  "The number of cards the backfill job will process at once."
  20)

(def ^:private min-repeat-ms
  "The minimum acceptable repeat rate for this job."
  1000)

(defsetting backfill-card-metadata-analysis-repeat-ms
  (deferred-tru "Period between runs of backfill job for metadata analysis on cards, in ms. Minimum is 1000, a lower setting will disable the job.")
  :type       :integer
  :visibility :internal
  :audit      :never
  :export?    true
  :default    20000)

(defn- analyze-card!
  "Reads a single card and analyzes its `:result_metadata`.

  Rules:
  - `:executed` or `:analyzed` cards should have `:ident`s for all columns in their `:result_metadata`
    - If they don't, mark them `:failed`, since only an erroneous code path could have done that!
  - `:failed` and `:blocked` cards should be skipped.
  - If the `:result_metadata` has (valid) idents for all columns already, mark it `:analyzed`.
  - Otherwise run the analysis:
    - If we can compute an ident for all columns, write out that metadata and mark it `:analyzed`.
    - If not, mark it `:blocked`.

  - If this card already contains `:result_metadata` with all idents properly defined, it's done. Mark it `:analyzed`.
  -
  "
  [card])

(defn- batched-metadata-analysis!
  "Runs a batch of metadata analysis, one card at a time."
  []
  (let [prioritized (t2/select :model/Card :metadata_analysis_state :priority {:limit *batch-size*})
        headroom    (- (count prioritized) *batch-size*)
        extras      (when (pos? headroom)
                      (t2/select :model/Card :metadata_analysis_state :not-started {:limit headroom}))]
    (doseq [card (concat prioritized extras)]
      (analyze-card! card))))

(task/defjob ^{:doc "Examines batches of cards to analyze their `:result_metadata` and backfill their idents."}
  BackfillCardMetadataAnalysis [_ctx]
  (batched-metadata-analysis!))

(defn- get-repeat-ms
  "Gets the desired repeat ms for the backfill job. Returns nil if the job should be disabled."
  []
  (let [repeat-ms (backfill-card-metadata-analysis-repeat-ms)]
    (cond
      (<= repeat-ms 0) nil
      (< repeat-ms min-repeat-ms) (do (log/warnf "backfill-card-metadata-analysis-repeat-ms of %dms is too low, using %dms"
                                                 repeat-ms
                                                 min-repeat-ms)
                                      min-repeat-ms)
      :else repeat-ms)))

(defn- start-backfill-job! []
  (let [repeat-ms (get-repeat-ms)]
    (if-not repeat-ms
      (log/infof "Not starting backfill-card-metadata-analysis task: backfill-card-metadata-analysis-repeat-ms is %d"
                 (backfill-card-metadata-analysis-repeat-ms))
      (do (log/info "Starting to analyze missing card metadata")
          (let [job (jobs/build
                     (jobs/of-type BackfillCardMetadataAnalysis)
                     (jobs/with-identity (jobs/key job-key)))
                trigger (triggers/build
                         (triggers/with-identity (triggers/key (model-key model)))
                         (triggers/start-now)
                         (triggers/with-schedule
                          (simple/schedule
                           (simple/with-interval-in-milliseconds repeat-ms)
                           (simple/repeat-forever))))]
            (task/schedule-task! job trigger))))))
