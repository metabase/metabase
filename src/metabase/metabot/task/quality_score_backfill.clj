(ns metabase.metabot.task.quality-score-backfill
  "Daily task that fills in `metabot_conversation.quality_score` for rows where
  it is NULL — historical conversations whose finalize hook predated the score
  column, plus the rare conversation that was abandoned mid-turn.

  Calls `quality.core/score-conversation!` directly per row: it is already
  idempotent and already converts its own throws into a Prometheus counter
  increment, so this job needs no additional retry or per-row error handling."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.metabot.quality.corpus-stats :as quality.corpus-stats]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key     (jobs/key     "metabase.task.metabot.quality-score-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.metabot.quality-score-backfill.trigger"))

(def ^:private batch-size
  "Discovery-query LIMIT for one pass through `unscored-conversation-ids`. Caps
  the size of any single id list pulled into memory; the job loops repeated
  batches per invocation until the discovery query returns empty, so this is
  not a per-invocation cap on the total rows scored."
  500)

(defn- unprocessed-conversation-ids
  "Return up to `batch-size` conversation ids whose `quality_breakdown` is
  NULL. Breakdown-nullness, not score-nullness, is the discovery key: format-
  era conversations score to `nil` for *quality_score* but receive a sentinel
  breakdown after their first attempt, and we must not re-discover them on
  every run.

  Newest-first so freshly-finalized conversations (whose user might still be
  looking at them) get scored before the historical backlog."
  []
  (->> (t2/query {:select   [:id]
                  :from     [:metabot_conversation]
                  :where    [:= :quality_breakdown nil]
                  :order-by [[:created_at :desc]]
                  :limit    batch-size})
       (map :id)))

(defn- backfill-quality-scores!
  []
  (log/info "Quality score backfill starting.")
  ;; Fetch the corpus-relative outlier threshold once up-front and thread it
  ;; through every per-row score call. Without this, dev environments (which
  ;; bypass `corpus-stats`'s 1-hour memoization for live-REPL development)
  ;; would re-issue the per-conversation corpus query thousands of times in
  ;; a single backfill, dominating the run's wall time.
  (let [threshold-info (quality.corpus-stats/outlier-threshold)]
    ;; `attempted` is a local skip-set so that any row whose score call threw
    ;; (catch boundary in `score-conversation!` swallows the exception, no
    ;; UPDATE fires, breakdown stays NULL) is not re-discovered within this
    ;; same run. Such rows remain eligible for tomorrow's run — transient
    ;; failures recover, permanent ones surface via the Prometheus counter.
    (loop [iteration 1 attempted #{} scored 0 sentinel 0 errored 0]
      (let [discovered (unprocessed-conversation-ids)
            ids        (vec (remove attempted discovered))
            n          (count ids)]
        (if (zero? n)
          (log/infof "Quality score backfill complete after %d iteration(s); scored %d, marked unscoreable %d, errored %d."
                     (dec iteration) scored sentinel errored)
          ;; `score-conversation!` returns three distinct shapes:
          ;;   number    — scored cleanly
          ;;   :sentinel — format-era guard fired (sentinel breakdown written)
          ;;   nil       — caught throw (no UPDATE fired)
          ;; Categorize on the return so the per-iteration log line is honest.
          (let [results       (mapv (fn [id]
                                      [id (quality.core/score-conversation! id threshold-info)])
                                    ids)
                this-scored   (count (filter (comp number?      second) results))
                this-sentinel (count (filter (comp #{:sentinel} second) results))
                this-errored  (count (filter (comp nil?         second) results))]
            (log/infof "Quality score backfill iteration %d: discovered %d, attempted %d, scored %d, marked unscoreable %d, errored %d."
                       iteration (count discovered) n this-scored this-sentinel this-errored)
            (recur (inc iteration)
                   (into attempted (map first) results)
                   (+ scored this-scored)
                   (+ sentinel this-sentinel)
                   (+ errored this-errored))))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Backfill metabot_conversation.quality_score for unscored rows."}
  QualityScoreBackfill [_ctx]
  (backfill-quality-scores!))

(defmethod task/init! ::QualityScoreBackfill
  [_]
  (let [job     (jobs/build
                 (jobs/of-type QualityScoreBackfill)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; daily at 02:17:43 — off-the-hour, in the low-traffic
                   ;; overnight window
                  (cron/cron-schedule "43 17 2 * * ?")))]
    (task/schedule-task! job trigger)))

(comment
  ;; REPL diagnostic. `score-conversation!` swallows throws into the
  ;; Prometheus counter, which makes a high error rate opaque. This helper
  ;; scores N unprocessed rows with the catch boundary OPEN so each throw's
  ;; class + message + top-of-stack are visible. Read-only — does not write
  ;; to the DB.
  ;;
  ;; Usage:
  ;;   (in-ns 'metabase.metabot.task.quality-score-backfill)
  ;;   (clojure.pprint/pprint (debug-backfill-sample! 5))
  (defn- stack-head [^Throwable t n]
    (->> (.getStackTrace t)
         (take n)
         (mapv (fn [^StackTraceElement e]
                 (format "%s.%s (%s:%d)"
                         (.getClassName e) (.getMethodName e)
                         (or (.getFileName e) "?") (.getLineNumber e))))))

  (defn debug-backfill-sample!
    [n]
    (let [ids            (take n (unprocessed-conversation-ids))
          threshold-info (quality.corpus-stats/outlier-threshold)]
      (mapv (fn [id]
              (try
                (let [messages (#'quality.core/conversation-messages id)
                      {:keys [quality_score quality_breakdown]}
                      (quality.core/compute-conversation-score messages threshold-info)]
                  (if (nil? quality_breakdown)
                    {:id id :status :sentinel}
                    {:id id :status :scored :score quality_score
                     :n-messages (count messages)}))
                (catch Throwable t
                  {:id         id
                   :status     :throw
                   :ex-class   (.getName (class t))
                   :message    (.getMessage t)
                   :stack-head (stack-head t 6)})))
            ids)))

  (clojure.pprint/pprint (debug-backfill-sample! 1000)))
