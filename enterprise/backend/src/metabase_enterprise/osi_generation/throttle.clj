(ns metabase-enterprise.osi-generation.throttle
  "Run budget for the OSI generation loop.

  Two layers:

  - A per-run mutable `tracker` threaded through one sequential run. It bounds entity count, summed
    input+output tokens, and wall-clock duration. These are *soft* thresholds: `allow?` is checked
    *between* candidates, so one call may overshoot and a wedged call is never interrupted. They bound
    one run, not spend over time.

  - Optional persistent hourly/daily token quotas summed from `ai_usage_log`. A superuser re-triggering
    the job multiplies the per-run cap; a configured window quota does not. These ship unset until a
    real backlog run provides a defensible default.

  Ordering only bites when a cap binds: `entity-cap` truncates the ordered `candidates` list, so the
  tier order (fresh/rewrite first) decides which entities a capped run spends on. With no
  cap the whole list runs and order is irrelevant.

  The tracker is not thread-safe by design: `run-generation!` is a sequential `reduce`, one tracker
  per run."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- Per-run tracker -----------------------------------------------

(defn run-budget
  "The current soft run caps as `{:max-entities n|nil :max-tokens n|nil :max-duration-ms n|nil}`.

  `nil` in any slot means that dimension is uncapped. `:max-tokens` is compared against input+output
  summed — one cap, matching the single `osi-generation-max-tokens-per-run` defsetting."
  []
  ;; The minutes cap is converted to ms so `allow?` compares against `u/since-ms` directly.
  {:max-entities    (settings/osi-generation-max-entities-per-run)
   :max-tokens      (settings/osi-generation-max-tokens-per-run)
   :max-duration-ms (when-let [minutes (settings/osi-generation-max-run-duration-minutes)]
                      (* minutes 60 1000))})

(defn new-tracker
  "An opaque mutable tracker for one run: the `budget`, a start timer, and running totals.

  One per run; totals accumulate as `consume!` is called after each candidate."
  [budget]
  {:budget     budget
   :timer      (u/start-timer)
   :totals     (atom {:entities 0, :input-tokens 0, :output-tokens 0})
   :stopped-by (atom nil)})

(defn- consumed
  "The tracker's running totals map."
  [tracker]
  @(:totals tracker))

(defn entity-cap
  "The `limit` to hand `candidates/candidates` — the *remaining* entity allowance, or nil when the
  entity dimension is uncapped.

  Remaining (not the configured maximum) so a reused tracker does not re-grant its whole budget: a
  fresh tracker returns the full `:max-entities`, a partly-consumed one returns what is left."
  [tracker]
  (when-let [max-entities (get-in tracker [:budget :max-entities])]
    (max 0 (- max-entities (:entities (consumed tracker))))))

(defn allow?
  "Whether the run may process the next candidate: `nil` to proceed, else `{:limit dim}` naming the
  first soft dimension that would be exceeded.

  Checked *before* each candidate. The bound dimension's keyword becomes the summary's `:stopped-by`
  and the metric's `budget-exhausted{limit=...}` label. Token overshoot is permitted for the candidate
  in flight because usage is only knowable after `generate-context` returns; the entity count is known
  beforehand and cannot overshoot. A wedged call is not interrupted; that is the per-call ceiling's job,
  not this soft check."
  [tracker]
  (let [{:keys [max-entities max-tokens max-duration-ms]} (:budget tracker)
        {:keys [entities input-tokens output-tokens]}     (consumed tracker)]
    (when-let [limit (cond
                       (and max-duration-ms (>= (u/since-ms (:timer tracker)) max-duration-ms)) {:limit :duration}
                       (and max-entities (>= entities max-entities))                            {:limit :entities}
                       (and max-tokens (>= (+ input-tokens output-tokens) max-tokens))          {:limit :tokens}
                       :else                                                                    nil)]
      (reset! (:stopped-by tracker) (:limit limit))
      limit)))

(defn consume!
  "Record one candidate's actual usage after it settles, returning the `tracker`.

  `usage` is `{:entities n :input-tokens n :output-tokens n}` — `:entities` is 1 for a processed
  candidate, and a restamp or skip still consumes an entity but no tokens."
  [tracker {:keys [entities input-tokens output-tokens] :or {entities 0, input-tokens 0, output-tokens 0}}]
  (swap! (:totals tracker) #(merge-with + % {:entities      entities
                                             :input-tokens  input-tokens
                                             :output-tokens output-tokens}))
  tracker)

(defn summary
  "End-of-run totals: `{:entities n :input-tokens n :output-tokens n :duration-ms n :stopped-by kw|nil}`.

  `:stopped-by` is nil on a run that exhausted its candidates and the `allow?` limit keyword when a
  soft cap stopped it early. `:duration-ms` is read when `summary` is called — call it after the
  trailing reconcile so the run deadline spans it. Fed to `metrics/record-run!`."
  [tracker]
  (merge (consumed tracker)
         {:duration-ms (Math/round ^double (u/since-ms (:timer tracker)))
          :stopped-by  @(:stopped-by tracker)}))

;;; ------------------------------------------ Persistent window quota ------------------------------------------

(defn- window-tokens-spent
  "Total OSI-generation tokens logged to `ai_usage_log` since `since` — the persistent, cross-run spend
  the per-run tracker cannot see. Attributed by `ai_usage_log.source` = [[settings/usage-source]]
  so it counts every node's runs, not just this one."
  [^java.time.Instant since]
  (or (:sum (t2/query-one {:select [[[:sum :total_tokens] :sum]]
                           :from   [:ai_usage_log]
                           :where  [:and
                                    [:= :source settings/usage-source]
                                    [:>= :created_at since]]}))
      0))

(defn window-budget
  "The tightest configured persistent token-window allowance, or nil when both quotas are unset.

  Returns `{:window :hour|:day :remaining-tokens n :exhausted? bool}`. Core folds `remaining-tokens`
  into the per-run tracker, so a run starting one token below a quota gets a one-token soft budget
  rather than a fresh full per-run allowance. As with every token budget, one in-flight candidate may
  overshoot because provider usage is known only after the response."
  []
  (let [now     (t/instant)
        windows (keep (fn [[window seconds quota]]
                        (when quota
                          (let [remaining (- quota (window-tokens-spent (.minusSeconds now seconds)))]
                            {:window window
                             :remaining-tokens (max 0 remaining)
                             :exhausted? (not (pos? remaining))})))
                      [[:hour 3600  (settings/osi-generation-max-tokens-per-hour)]
                       [:day  86400 (settings/osi-generation-max-tokens-per-day)]])]
    (when (seq windows)
      (apply min-key :remaining-tokens windows))))

(defn window-quota-exceeded?
  "Compatibility predicate returning the exhausted window keyword, or nil. New callers that start a
  run should use [[window-budget]] so the remaining allowance also constrains that run."
  []
  (let [{:keys [window exhausted?]} (window-budget)]
    (when exhausted? window)))
