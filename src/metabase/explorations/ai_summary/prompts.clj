(ns metabase.explorations.ai-summary.prompts
  "Selmer-based loader for the ai-summary phase prompts.

  Templates live in `resources/explorations/ai_summary/prompts/` and
  follow the same pattern used by `metabase.metabot.agent.prompts`:
  slurp from the classpath, cache the raw string in an atom, render with
  Selmer."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

(def ^:private template-dir "explorations/ai_summary/prompts/")

(def ^:private template-cache (atom {}))

(defn- load-template
  [filename]
  (let [path (str template-dir filename)]
    (or (some-> (io/resource path) slurp)
        (do (log/error "AI Summary prompt template not found:" path)
            nil))))

(defn- cached-template
  [filename]
  (or (get @template-cache filename)
      (when-let [t (load-template filename)]
        (swap! template-cache assoc filename t)
        t)))

(defn render
  "Render the named template (relative to
  `resources/explorations/ai_summary/prompts/`) with the supplied
  context map. Returns the unrendered template on render failure so a
  template bug never kills a run."
  [filename context]
  (when-let [t (cached-template filename)]
    (try
      (selmer/render t context)
      (catch Exception e
        (log/error e "Failed to render ai-summary prompt template:" filename)
        t))))

(defn clear-cache!
  "Drop cached template strings. Useful when iterating on a template at
  the REPL without restarting the JVM."
  []
  (reset! template-cache {}))
