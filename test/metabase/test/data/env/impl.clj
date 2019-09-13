(ns metabase.test.data.env.impl
  (:require [clojure.string :as str]
            [environ.core :refer [env]]
            [metabase.test.initialize :as initialize]
            [metabase.util :as u]))

(defn- get-drivers-from-env []
  (when (seq (env :engines))
    (println
     (u/format-color 'red
         "The env var ENGINES is no longer supported. Please specify drivers to run tests against with DRIVERS instead.")))
  (when-let [env-drivers (some-> (env :drivers) str/lower-case)]
    (set (for [engine (str/split env-drivers #",")
               :when engine]
           (keyword engine)))))

(defn get-test-drivers
  "Return a set of drivers to test against from the env var `DRIVERS`."
  []
  (if-let [drivers (get-drivers-from-env)]
    (do
      (initialize/initialize-if-needed! :plugins)
      drivers)
    #{:h2}))
