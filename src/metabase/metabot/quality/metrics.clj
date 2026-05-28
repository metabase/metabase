(ns metabase.metabot.quality.metrics
  "Pure per-conversation quality measurements. Each metric is a health in
  `[0, 1]` (1 = good) or `:na` when its denominator is empty.

  [[compute]] reads the normalized struct (with `:temporal` populated by
  [[metabase.metabot.quality.temporal/derive]]) and the batched governance
  map (the `{[type id-str] facts}` shape returned by
  [[metabase.metabot.quality.governance/resolve]]). Governance is consulted
  by the data-source metrics; metrics that need only the entity sets ignore
  it.")

(set! *warn-on-reflection* true)

(defn- grounding
  "Fraction of authored entities that were actually surfaced to the agent —
  `1 − |authored-but-never-seen| / |authored|`. The never-seen set is the
  authored entities absent from both the prompt context and every tool
  result, so the ratio is in `[0, 1]`. `:na` when nothing was authored."
  [normalized]
  (let [q (count (get-in normalized [:sets :Q]))]
    (if (zero? q)
      :na
      (- 1.0 (/ (double (count (get-in normalized [:sets :H])))
                (double q))))))

(defn- tool-call-failure-rate
  "Fraction of tool calls that returned an error. `0.0` when the
  conversation made no tool calls."
  ^double [normalized]
  (let [events (:tool-events normalized)
        total  (count events)]
    (if (zero? total)
      0.0
      (/ (double (count (filter (comp some? :error) events)))
         (double total)))))

(defn- termination-signal
  "`0.0` when the agent stopped on its own — signaled done or emitted a
  final response — and `1.0` for any other exit (hit the iteration cap,
  errored, was aborted, or an unrecognized state). Reads the categorical
  populated by [[metabase.metabot.quality.temporal/derive]]."
  ^double [normalized]
  (case (get-in normalized [:temporal :terminal-state])
    (:model_signaled_done :final_response) 0.0
    1.0))

(defn compute
  "Pure conversation metrics. `normalized` is the struct from
  [[metabase.metabot.quality.extract/normalize]] with `:temporal`
  populated by [[metabase.metabot.quality.temporal/derive]].

  Returns a map of metric keyword → health-in-`[0, 1]`-or-`:na`, plus the
  raw execution inputs the subscore layer composes."
  [normalized _governance]
  {:grounding              (grounding normalized)
   :tool-call-failure-rate (tool-call-failure-rate normalized)
   :termination-signal     (termination-signal normalized)})

(comment
  ;; Healthy: everything authored was grounded, no tool errors, clean exit.
  (compute {:sets        {:Q {["card" "1"] {}} :H {}}
            :tool-events []
            :temporal    {:terminal-state :final_response}}
           {})

  ;; Ungrounded, half the tool calls errored, forced to stop at the cap.
  (compute {:sets        {:Q (zipmap (range 4) (repeat {})) :H (zipmap (range 4) (repeat {}))}
            :tool-events [{:error {:msg "x"}} {}]
            :temporal    {:terminal-state :iter_cap}}
           {}))
