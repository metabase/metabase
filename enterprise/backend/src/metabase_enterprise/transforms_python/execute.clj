(ns metabase-enterprise.transforms-python.execute
  "Python transform execution. Delegates to the shared runner executor."
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(def ^:private python-lang-config
  {:runtime "python"
   :label "Python"
   :timing-key :python-execution
   :transform-type-pred transforms.util/python-transform?})

(defn execute-python-transform!
  "Execute a Python transform by calling the python runner.

  Blocks until the transform returns."
  [transform options]
  (runner.execute/execute-runner-transform! transform options python-lang-config))
