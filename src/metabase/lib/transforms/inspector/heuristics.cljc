(ns metabase.lib.transforms.inspector.heuristics
  "Trigger matching and alert generation for inspector lenses.
   Evaluates conditions against card summaries to determine:
   - Which alerts should be shown
   - Which drill-down lenses should be activated

   This is a cljc namespace so it can be used by both:
   - Backend: to process feedback and return alerts/activated lenses
   - Frontend: to evaluate triggers client-side without round-trip

   Trigger conditions are declarative expressions that reference card results.")

;;; -------------------------------------------------- Condition Evaluation --------------------------------------------------

(defn- get-card-summary
  "Get the summary for a card by ID from the summaries map."
  [card-summaries card-id]
  (get card-summaries card-id))

(defn- extract-value
  "Extract a value from a card summary.
   Supports:
   - :row-count - number of rows
   - :first-value - first cell of first row
   - :null-rate - proportion of nulls (if tracked)
   - :distinct-count - number of distinct values
   - :match-rate - computed match rate (for join stats)
   - :unmatched-count - computed unmatched count
   - :expansion-factor - computed expansion factor"
  [card-summary value-key]
  (case value-key
    :row-count        (:row-count card-summary)
    :first-value      (-> card-summary :first-row first)
    :null-rate        (:null-rate card-summary)
    :distinct-count   (:distinct-count card-summary)
    :is-degenerate    (:is-degenerate card-summary)
    :match-rate       (:match-rate card-summary)
    :unmatched-count  (:unmatched-count card-summary)
    :expansion-factor (:expansion-factor card-summary)
    :base-count       (:base-count card-summary)
    :final-count      (:final-count card-summary)
    ;; Default: try direct lookup
    (get card-summary value-key)))

(defn- compare-values
  "Compare two values with an operator."
  [op left right]
  (when (and (some? left) (some? right))
    (case op
      :>  (> left right)
      :>= (>= left right)
      :<  (< left right)
      :<= (<= left right)
      :=  (= left right)
      :!= (not= left right)
      false)))

(defn- evaluate-condition
  "Evaluate a single condition against card summaries.

   Condition formats:
   - :always - always true
   - :never - always false
   - [:card-id \"some-card\" :value-key :op :threshold]
     e.g. [:card-id \"match-rate\" :first-value :< 0.9]
   - [:and cond1 cond2 ...]
   - [:or cond1 cond2 ...]
   - [:not cond]"
  [condition card-summaries]
  (cond
    (= condition :always)
    true

    (= condition :never)
    false

    (vector? condition)
    (let [[op & args] condition]
      (case op
        :card-id
        (let [[card-id value-key comparison threshold] args
              summary (get-card-summary card-summaries card-id)
              value   (extract-value summary value-key)]
          (compare-values comparison value threshold))

        :and
        (every? #(evaluate-condition % card-summaries) args)

        :or
        (some #(evaluate-condition % card-summaries) args)

        :not
        (not (evaluate-condition (first args) card-summaries))

        ;; Legacy format: [value-key op threshold] with implicit card-id
        ;; Not recommended but supported for simple cases
        false))

    :else
    false))

;;; -------------------------------------------------- Alert Generation --------------------------------------------------

(def ^:private alert-templates
  "Templates for generating alert messages.
   Keys match alert types, values are functions (context -> message string)."
  {:low-match-rate
   (fn [{:keys [match-rate unmatched-count]}]
     (let [pct (some-> match-rate (* 100) int)]
       (if unmatched-count
         (str pct "% match rate (" unmatched-count " unmatched rows)")
         (str pct "% match rate"))))

   :high-null-rate
   (fn [{:keys [null-rate field-name]}]
     (let [pct (some-> null-rate (* 100) int)]
       (str pct "% null values" (when field-name (str " in " field-name)))))

   :row-expansion
   (fn [{:keys [expansion-factor]}]
     (str "Row count increased " expansion-factor "x (possible cross-product)"))

   :row-contraction
   (fn [{:keys [contraction-factor]}]
     (str "Row count decreased to " (int (* contraction-factor 100)) "%"))

   :no-data
   (fn [_] "No data returned")})

(defn- generate-alert-message
  "Generate a human-readable message for an alert."
  [alert-type context]
  (if-let [template (get alert-templates alert-type)]
    (template context)
    (str "Alert: " (name alert-type))))

(defn- extract-alert-context
  "Extract context values from card summaries for alert message generation."
  [alert-def card-summaries]
  (let [{:keys [context-cards]} alert-def]
    (reduce (fn [ctx [ctx-key card-id value-key]]
              (let [summary (get-card-summary card-summaries card-id)
                    value   (extract-value summary value-key)]
                (assoc ctx ctx-key value)))
            {}
            context-cards)))

;;; -------------------------------------------------- Derived Stats Computation --------------------------------------------------

(defn compute-join-stats
  "Compute derived join statistics from raw card values.
   Takes card summaries with step-N-count and step-N-matched values.

   Returns a map with computed stats:
   - :base-count - row count before any joins
   - :final-count - row count after all joins
   - :expansion-factor - final-count / base-count
   - :match-rate - matched / prev-count for outer joins
   - :unmatched-count - prev-count - matched for outer joins"
  [card-summaries]
  (let [base-count (some-> (get-card-summary card-summaries "step-0-count")
                           (extract-value :first-value))
        ;; Find the highest step count
        step-counts (->> card-summaries
                         keys
                         (filter #(and (string? %)
                                       (re-matches #"step-\d+-count" %)))
                         #?(:clj  (map #(Integer/parseInt (second (re-find #"step-(\d+)-count" %))))
                            :cljs (map #(js/parseInt (second (re-find #"step-(\d+)-count" %)))))
                         sort
                         reverse)
        last-step (first step-counts)
        final-count (when last-step
                      (some-> (get-card-summary card-summaries (str "step-" last-step "-count"))
                              (extract-value :first-value)))

        ;; Compute expansion factor
        expansion-factor (when (and base-count final-count (pos? base-count))
                           (double (/ final-count base-count)))

        ;; Find match stats for outer joins (step-N-matched)
        ;; For simplicity, just use the first matched count we find
        first-matched-step (first (filter #(get card-summaries (str "step-" % "-matched"))
                                          (range 1 (inc (or last-step 0)))))
        prev-count (when first-matched-step
                     (some-> (get-card-summary card-summaries
                                               (str "step-" (dec first-matched-step) "-count"))
                             (extract-value :first-value)))
        matched-count (when first-matched-step
                        (some-> (get-card-summary card-summaries
                                                  (str "step-" first-matched-step "-matched"))
                                (extract-value :first-value)))

        match-rate (when (and prev-count matched-count (pos? prev-count))
                     (double (/ matched-count prev-count)))
        unmatched-count (when (and prev-count matched-count)
                          (- prev-count matched-count))]

    (cond-> {}
      base-count       (assoc :base-count base-count)
      final-count      (assoc :final-count final-count)
      expansion-factor (assoc :expansion-factor expansion-factor)
      match-rate       (assoc :match-rate match-rate)
      unmatched-count  (assoc :unmatched-count unmatched-count))))

(defn- enrich-with-computed-stats
  "Enrich card summaries with computed derived stats as synthetic cards.
   This allows alert conditions to reference computed values like match-rate."
  [card-summaries]
  (let [join-stats (compute-join-stats card-summaries)]
    (cond-> card-summaries
      ;; Add synthetic card for join stats that conditions can reference
      (seq join-stats)
      (assoc "computed-join-stats" {:first-row [(or (:match-rate join-stats) 1.0)]
                                    :match-rate (:match-rate join-stats)
                                    :unmatched-count (:unmatched-count join-stats)
                                    :expansion-factor (:expansion-factor join-stats)
                                    :base-count (:base-count join-stats)
                                    :final-count (:final-count join-stats)}))))

(defn evaluate-alert
  "Evaluate a single alert definition against card summaries.
   Returns the alert with concrete values if triggered, nil otherwise.

   Alert definition:
   {:id \"low-match-rate\"
    :type :low-match-rate
    :severity :warning
    :condition [:card-id \"match-rate-card\" :first-value :< 0.9]
    :context-cards [[:match-rate \"match-rate-card\" :first-value]
                    [:unmatched-count \"unmatched-card\" :first-value]]
    :drill-lens-id \"unmatched-analysis\"}"
  [alert-def card-summaries]
  (when (evaluate-condition (:condition alert-def) card-summaries)
    (let [context (extract-alert-context alert-def card-summaries)
          message (generate-alert-message (:type alert-def) context)]
      {:id            (:id alert-def)
       :type          (:type alert-def)
       :severity      (:severity alert-def)
       :message       message
       :context       context
       :card-ids      (:card-ids alert-def)
       :drill-lens-id (:drill-lens-id alert-def)})))

;;; -------------------------------------------------- Drill Lens Activation --------------------------------------------------

(defn evaluate-drill-lens
  "Evaluate if a drill-down lens should be activated.
   Returns the lens with updated display info if activated, nil otherwise.

   Drill lens definition:
   {:id \"unmatched-analysis\"
    :display-name \"Unmatched Rows\"
    :description \"Investigate unmatched join rows\"
    :condition [:card-id \"match-rate-card\" :first-value :< 0.95]
    :display-name-template (fn [ctx] (str \"Investigate \" (:count ctx) \" Unmatched Rows\"))
    :context-cards [[:count \"unmatched-card\" :first-value]]}"
  [drill-lens-def card-summaries]
  (when (evaluate-condition (:condition drill-lens-def) card-summaries)
    (let [context (extract-alert-context drill-lens-def card-summaries)
          ;; Update display name with concrete values if template provided
          display-name (if-let [template (:display-name-template drill-lens-def)]
                         (template context)
                         (:display-name drill-lens-def))
          description (if-let [template (:description-template drill-lens-def)]
                        (template context)
                        (:description drill-lens-def))]
      {:id           (:id drill-lens-def)
       :display-name display-name
       :description  description
       :context      context})))

;;; -------------------------------------------------- Main Evaluation --------------------------------------------------

(defn evaluate-triggers
  "Evaluate all triggers (alerts and drill-lenses) against card summaries.

   Arguments:
   - lens: the lens definition containing :alert-triggers and :drill-lens-triggers
   - card-summaries: map of card-id -> {:row-count :first-row :is-degenerate ...}

   Returns:
   {:alerts [{:id :type :severity :message :drill-lens-id} ...]
    :activated-drill-lenses [{:id :display-name :description} ...]
    :degenerate-cards [\"card-id-1\" \"card-id-2\" ...]
    :computed-stats {:match-rate :expansion-factor ...}}"
  [lens card-summaries]
  (let [;; Enrich with computed derived stats (match-rate, expansion-factor, etc.)
        enriched-summaries (enrich-with-computed-stats card-summaries)
        computed-stats (get enriched-summaries "computed-join-stats")

        ;; Evaluate alerts against enriched summaries
        alerts (->> (:alert-triggers lens)
                    (keep #(evaluate-alert % enriched-summaries))
                    vec)

        ;; Evaluate drill lenses
        activated-lenses (->> (:drill-lens-triggers lens)
                              (keep #(evaluate-drill-lens % enriched-summaries))
                              vec)

        ;; Collect degenerate cards (exclude synthetic cards)
        degenerate-cards (->> card-summaries
                              (filter (fn [[_card-id summary]]
                                        (:is-degenerate summary)))
                              (map first)
                              vec)]

    (cond-> {:alerts                 alerts
             :activated-drill-lenses activated-lenses
             :degenerate-cards       degenerate-cards}
      computed-stats (assoc :computed-stats computed-stats))))

(defn merge-feedback-response
  "Merge the trigger evaluation results with any additional computed data.
   This is the response format sent back to FE from the feedback endpoint."
  [trigger-results additional-data]
  (merge trigger-results additional-data))
