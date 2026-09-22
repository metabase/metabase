(ns metabase.metabot.agent.timing
  "Per-turn timing of the agent loop: model calls, tool calls, and the System One steps around them, summarized in
  one log line per turn so a slow turn shows where its time went."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:dynamic *timings*
  "An atom collecting this turn's timing events, or nil outside an agent turn."
  nil)

(def ^:dynamic *step*
  "The agent loop iteration events are recorded under, or nil before the loop starts."
  nil)

(defn record!
  "Record a timing `event` (a map with at least `:ms`) for the current turn. No-op outside an agent turn."
  [event]
  (when-let [timings *timings*]
    (swap! timings conj (cond-> event *step* (assoc :step *step*))))
  nil)

(defmacro timed
  "Evaluate `body`, recording `event` with the elapsed `:ms`."
  [event & body]
  `(let [timer# (u/start-timer)]
     (try
       ~@body
       (finally
         (record! (assoc ~event :ms (long (u/since-ms timer#))))))))

(defn summary
  "Group `events` for logging: those recorded before the loop started, then each loop step's in order."
  [events]
  (let [{before nil :as by-step} (group-by :step events)]
    {:before-loop (vec before)
     :steps       (into (sorted-map)
                        (map (fn [[step step-events]] [step (mapv #(dissoc % :step) step-events)]))
                        (dissoc by-step nil))}))
