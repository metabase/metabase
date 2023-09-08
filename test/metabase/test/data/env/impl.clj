(ns metabase.test.data.env.impl
  (:require
   [clojure.string :as str]
   [metabase.config.env :as config.env]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- get-drivers-from-env []
  (when (seq (config.env/*env* :engines))
    (log/error
     (u/format-color 'red
         "The env var ENGINES is no longer supported. Please specify drivers to run tests against with DRIVERS instead.")))
  (when-let [env-drivers (some-> (config.env/*env* :drivers) u/lower-case-en)]
    (set (for [engine (str/split env-drivers #",")
               :when engine]
           (keyword engine)))))

(defn get-test-drivers
  "Return a set of drivers to test against from the env var `DRIVERS`."
  []
  (or (get-drivers-from-env) #{:h2}))
