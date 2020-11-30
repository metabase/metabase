(ns build-driver
  "Entrypoint for `bin/build-driver.sh`. Builds a single driver, if needed."
  (:require [build-drivers.build-driver :as build-driver]
            [metabuild-common.core :as u]))

(defn -main [& [driver]]
  (u/exit-when-finished-nonzero-on-exception
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m build-driver <driver>" {})))
    (build-driver/build-driver! (keyword driver))))
