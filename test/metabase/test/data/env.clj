(ns metabase.test.data.env
  "Logic for determining which datasets to test against.

  By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which datasets to test
  against by setting the env var `DRIVERS` to a comma-separated list of dataset names, e.g.

    # test against :h2 and :mongo
    DRIVERS=h2,mongo

    # just test against :h2 (default)
    DRIVERS=h2"
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [metabase.test.initialize :as initialize]
            [metabase.util :as u]))

(defn- get-drivers-from-env
  "Return a set of drivers to test against from the env var `DRIVERS`."
  []
  (when (seq (env :engines))
    (println
     (u/format-color 'red
         "The env var ENGINES is no longer supported. Please specify drivers to run tests against with DRIVERS instead.")))
  (when-let [env-drivers (some-> (env :drivers) str/lower-case)]
    (set (for [engine (str/split env-drivers #",")
               :when engine]
           (keyword engine)))))

(defn- get-test-drivers []
  (if-let [drivers (get-drivers-from-env)]
    (do
      (initialize/initialize-if-needed! :plugins)
      drivers)
    #{:h2}))

(defonce ^{:doc (str "Set of names of drivers we should run tests against. By default, this only contains `:h2` but can"
                     " be overriden by setting env var `DRIVERS`.")}
  test-drivers
  (let [drivers (get-test-drivers)]
    (log/info (color/cyan "Running QP tests against these drivers: " drivers))
    drivers))
