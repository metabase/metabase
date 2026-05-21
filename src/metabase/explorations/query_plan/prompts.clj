(ns metabase.explorations.query-plan.prompts
  "Selmer-based loader for the query-plan prompts. Templates live in
  `resources/explorations/query_plan/prompts/`. Mirrors
  `metabase.explorations.auto-insights.prompts` but with its own template
  directory + cache so the two prompt families stay independently editable
  and the cache can be cleared per-namespace at the REPL."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

(def ^:private template-dir "explorations/query_plan/prompts/")

(def ^:private template-cache (atom {}))

(defn- load-template
  [filename]
  (let [path (str template-dir filename)]
    (or (some-> (io/resource path) slurp)
        (do (log/error "Query-plan prompt template not found:" path)
            nil))))

(defn- cached-template
  [filename]
  (or (get @template-cache filename)
      (when-let [t (load-template filename)]
        (swap! template-cache assoc filename t)
        t)))

(defn render
  "Render the named template (relative to
  `resources/explorations/query_plan/prompts/`) with the supplied context
  map. Returns the unrendered template on render failure so a template bug
  never kills a run."
  [filename context]
  (when-let [t (cached-template filename)]
    (try
      (selmer/render t context)
      (catch Exception e
        (log/error e "Failed to render query-plan prompt template:" filename)
        t))))

(defn clear-cache!
  "Drop cached template strings. Useful when iterating at the REPL."
  []
  (reset! template-cache {}))
