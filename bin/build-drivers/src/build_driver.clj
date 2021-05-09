(ns build-driver
  "Entrypoint for `bin/build-driver.sh`. Builds a single driver, if needed."
  (:require [build-drivers.build-driver :as build-driver]
            [metabuild-common.core :as u]))

(defn -main [& [driver edition]]
  (u/exit-when-finished-nonzero-on-exception
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m build-driver <driver> [edition]" {})))
    (build-driver/build-driver! (keyword driver) (or (keyword edition) :oss))))
