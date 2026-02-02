(ns metabase.llm.costs
  "LLM cost estimation utils."
  (:require
   [clojure.string :as str]))

(def ^:private model-pricing
  "Model pricing by model family. Prices are in USD. :input and :output are per :scale tokens."
  {"anthropic/claude-opus-4-5"   {:input  5.00 :output 25.00 :scale 1000000}
   "anthropic/claude-opus-4-1"   {:input 15.00 :output 75.00 :scale 1000000}
   "anthropic/claude-opus-4"     {:input 15.00 :output 75.00 :scale 1000000}
   "anthropic/claude-sonnet-4-5" {:input  3.00 :output 15.00 :scale 1000000}
   "anthropic/claude-sonnet-4"   {:input  3.00 :output 15.00 :scale 1000000}
   "anthropic/claude-haiku-4-5"  {:input  1.00 :output  5.00 :scale 1000000}
   "anthropic/claude-haiku-3-5"  {:input  0.80 :output  4.00 :scale 1000000}
   "anthropic/claude-haiku-3"    {:input  0.25 :output  1.25 :scale 1000000}})

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
