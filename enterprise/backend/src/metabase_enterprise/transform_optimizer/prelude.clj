(ns metabase-enterprise.transform-optimizer.prelude
  "Loads the static prelude that anchors the LLM's system prompt.

  The prelude is a single curated markdown file under
  `resources/transform_optimizer/prelude.md`. It encodes:

    - what \"equivalent\" means (no semantic drift)
    - the JSON output schema the LLM must emit
    - the severity rubric (so server-side scoring matches what the model
      was told to do)
    - 4 worked pre→post examples covering the four proposal kinds
    - constraints on emitted CREATE INDEX statements

  Loaded once and cached. Edit the .md file and restart to pick up changes;
  reloading on each call would burn a classpath read per request."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private resource-path "transform_optimizer/prelude.md")

(def ^:private cached
  (delay
    (if-let [r (io/resource resource-path)]
      (slurp r)
      (do (log/errorf "transform-optimizer: prelude resource not found at %s" resource-path)
          ""))))

(defn prelude
  "Return the prelude markdown as a single string. Cached for the life of the
  JVM."
  []
  @cached)
