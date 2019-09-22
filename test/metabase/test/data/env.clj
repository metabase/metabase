(ns metabase.test.data.env
  "Logic for determining which datasets to test against.

  By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which datasets to test
  against by setting the env var `DRIVERS` to a comma-separated list of dataset names, e.g.

    # test against :h2 and :mongo
    DRIVERS=h2,mongo

    # just test against :h2 (default)
    DRIVERS=h2"
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [metabase.test.data.env.impl :as impl]
            [metabase.test.initialize :as initialize]))

(defonce ^{:doc (str "Set of names of drivers we should run tests against. By default, this only contains `:h2` but can"
                     " be overriden by setting env var `DRIVERS`.")}
  test-drivers
  (let [drivers (impl/get-test-drivers)]
    (log/info (color/cyan "Running QP tests against these drivers: " drivers))
    (when-not (= drivers #{:h2})
      (initialize/initialize-if-needed! :plugins))
    drivers))
