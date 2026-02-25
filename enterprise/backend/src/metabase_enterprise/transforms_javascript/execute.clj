(ns metabase-enterprise.transforms-javascript.execute
  "JavaScript transform execution. Delegates to the shared runner executor."
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]))

(set! *warn-on-reflection* true)

(def ^:private javascript-lang-config
  {:runtime "javascript"
   :label "JavaScript"
   :timing-key :javascript-execution})

(defn execute-javascript-transform!
  "Execute a JavaScript transform by calling the runner.

  Blocks until the transform returns."
  [transform options]
  (runner.execute/execute-runner-transform! transform options javascript-lang-config))
