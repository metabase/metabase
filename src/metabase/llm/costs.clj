(ns metabase.llm.costs
  "LLM cost estimation utils."
  (:require
   [clojure.string :as str]))

(def ^:private model-pricing
  "Model pricing by model family. Prices are in USD. :input and :output are per :scale tokens."
  {"anthropic/claude-3-5-haiku"  {:input  0.80, :output  4.00, :scale 1000000},
   "anthropic/claude-3-7-sonnet" {:input  3.00, :output 15.00, :scale 1000000},
   "anthropic/claude-3-haiku"    {:input  0.25, :output  1.25, :scale 1000000},
   "anthropic/claude-haiku-3"    {:input  0.25, :output  1.25, :scale 1000000},
   "anthropic/claude-haiku-3-5"  {:input  0.80, :output  4.00, :scale 1000000},
   "anthropic/claude-haiku-4-5"  {:input  1.00, :output  5.00, :scale 1000000},
   "anthropic/claude-opus-4"     {:input 15.00, :output 75.00, :scale 1000000},
   "anthropic/claude-opus-4-1"   {:input 15.00, :output 75.00, :scale 1000000},
   "anthropic/claude-opus-4-5"   {:input  5.00, :output 25.00, :scale 1000000},
   "anthropic/claude-sonnet-4"   {:input  3.00, :output 15.00, :scale 1000000},
   "anthropic/claude-sonnet-4-5" {:input  3.00, :output 15.00, :scale 1000000}})

(comment
  ;; Eval the following forms to get an updated model-pricing table with keys for new anthropic models. Unfortunately,
  ;; model prices don't seem to be fetchable via an API at time of writing, so you have have to look them up for any
  ;; new models at the following URL (we could scrape it, but seems fragile):
  ;;
  ;; https://platform.claude.com/docs/en/about-claude/pricing

  ;; First configure metabase.llm.settings/llm-anthropic-api-key with a valid key
  ((requiring-resolve 'metabase.llm.settings/llm-anthropic-api-key!) "<api-key>")

  (defn- merge-pricing [new-models]
    (merge new-models model-pricing))

  (->> ((requiring-resolve 'metabase.llm.anthropic/list-models))
       :models
       (map (fn [{:keys [id]}]
              [(normalize-model-name id) {:input nil :output nil :scale 1000000}]))
       (into {})
       merge-pricing
       (into (sorted-map))))

(defn- normalize-model-name
  "Normalize a raw model name to the `provider/family` format used in the pricing table.
   Strips the date suffix (e.g. -20250514) and adds the anthropic/ prefix if missing.

   E.g. \"claude-sonnet-4-5-20250929\" -> \"anthropic/claude-sonnet-4-5\""
  [model]
  (when model
    (let [stripped (str/replace model #"-\d{8}$" "")]
      (if (str/starts-with? stripped "anthropic/")
        stripped
        (str "anthropic/" stripped)))))

(defn estimate
  "Estimate the cost in USD for token usage.

  Accepts raw model names (e.g. \"claude-sonnet-4-5-20250929\") and normalizes
  them to match the pricing table. Returns 0.0 for unknown models."
  [{:keys [model prompt completion]}]
  (if-let [{:keys [input output scale]} (get model-pricing (normalize-model-name model))]
    (+ (* (/ (double prompt) scale) input)
       (* (/ (double completion) scale) output))
    0.0))
