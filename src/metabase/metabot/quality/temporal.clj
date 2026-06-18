(ns metabase.metabot.quality.temporal
  "Temporal derivations over the normalized struct produced by
  [[metabase.metabot.quality.extract/normalize]]. Pure — given the
  normalized struct it returns the same struct enriched with:

  - `:t-first-used` populated on each authored-set atom record
    (`extract.clj` leaves it `nil`).
  - A top-level `:temporal` block with `:iterations` and `:terminal-state`.

  Message-row `:data` parts come back through `mi/transform-json`, so part
  `:type` values are *strings* (`\"data\"`, `\"tool-input\"`, ...) and map
  keys are keywords. A persisted `terminal_state` data part reads back as
  `{:type \"data\" :data-type \"terminal_state\" :data {:reason \"iter_cap\"}}`."
  (:refer-clojure :exclude [derive])
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; t-first-used population
;;; ---------------------------------------------------------------------------

(defn- min-authored-iteration
  "Min iteration across the atom's `:authored`-tagged provenance entries.
  Returns `nil` if the atom isn't an authored-set member or none of its
  authored provenance entries carry an iteration."
  [atom-rec]
  (let [iters (for [{prov-set :set :keys [iteration]} (:provenance atom-rec)
                    :when (= :authored prov-set)
                    :when (some? iteration)]
                iteration)]
    (when (seq iters) (apply min iters))))

(defn- populate-t-first-used
  "Walk the authored-set atoms and set each one's `:t-first-used`. Other
  sets are left untouched — by contract `:t-first-used` is only
  meaningful for atoms that the agent actually authored against."
  [sets]
  (update sets :authored
          (fn [authored-map]
            (reduce-kv (fn [acc k atom-rec]
                         (assoc acc k (assoc atom-rec :t-first-used (min-authored-iteration atom-rec))))
                       {}
                       authored-map))))

;;; ---------------------------------------------------------------------------
;;; Iteration count
;;; ---------------------------------------------------------------------------

(defn- compute-iterations
  "Total iteration count for the conversation: `(inc (max iteration-index))`.
  Defaults to `0` for an empty tool-events stream so pre-instrumentation
  conversations don't crash here."
  [tool-events]
  (let [iters (keep :iteration-index tool-events)]
    (if (seq iters)
      (inc (apply max iters))
      0)))

;;; ---------------------------------------------------------------------------
;;; Terminal-state classification
;;; ---------------------------------------------------------------------------

(defn- reason-from-terminal-state-part
  "Find the `terminal_state` data part on an assistant row's `:data` and
  project its `:reason` to a categorical keyword, or `nil` when absent.
  Unknown reasons fall through to `:error`."
  [row]
  (when-let [reason-str
             (some (fn [part]
                     (when (and (= "data" (:type part))
                                (= streaming/terminal-state-type (:data-type part)))
                       (some-> part :data :reason)))
                   (:data row))]
    (let [k (keyword reason-str)]
      (if (contains? constants/terminal-state-reasons k) k :error))))

(defn- last-assistant-row
  "Last assistant row in chronological order. The normalized struct's
  `:messages` is already sorted by `(created_at, id)`."
  [messages]
  (last (filter #(= :assistant (:role %)) messages)))

(defn- compute-terminal-state
  "Project the conversation's exit condition onto a categorical. Priority
  order:

  1. `terminal_state` data part on the last assistant row →
     `:model_signaled_done | :final_response | :iter_cap | :error`
  2. `metabot_message.error` non-nil → `:error`
  3. `metabot_message.finished = false` → `:aborted`
  4. Default → `:model_signaled_done`

  Returns `:model_signaled_done` for conversations with no assistant
  row at all — degenerate but harmless (this layer is pure and must not
  throw on edge shapes)."
  [messages]
  (let [row (last-assistant-row messages)]
    (cond
      (nil? row)
      :model_signaled_done

      (some? (reason-from-terminal-state-part row))
      (reason-from-terminal-state-part row)

      (some? (:error row))
      :error

      (false? (:finished row))
      :aborted

      :else
      :model_signaled_done)))

;;; ---------------------------------------------------------------------------
;;; Public surface
;;; ---------------------------------------------------------------------------

(defn instrumented?
  "True iff any assistant row carries a real `terminal_state` data part —
  i.e. the conversation ran the instrumented agent loop. Reads `:messages`
  directly rather than the derived `:terminal-state`, because that field
  defaults to `:model_signaled_done` when no part exists and so cannot be
  told apart from a genuine done signal."
  [{:keys [messages]}]
  (boolean (some (fn [row]
                   (and (= :assistant (:role row))
                        (some? (reason-from-terminal-state-part row))))
                 messages)))

(defn derive
  "Given a normalized struct from `extract/normalize`, return the same
  struct with `:t-first-used` populated on each authored-set atom record
  and a new `:temporal` block:

  ```clojure
  {:iterations     Long
   :terminal-state Keyword}
  ```"
  [{:keys [messages tool-events sets] :as normalized}]
  (assoc normalized
         :sets     (populate-t-first-used sets)
         :temporal {:iterations     (compute-iterations tool-events)
                    :terminal-state (compute-terminal-state messages)}))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Round-trip an extract output through derive — verify the :temporal block
  ;; lands and authored-atom :t-first-used is populated.
  (require '[metabase.metabot.quality.extract :as extract])
  (-> (extract/normalize [])
      derive
      :temporal))
