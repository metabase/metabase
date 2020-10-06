(ns build-driver
  "Entrypoint for `bin/build-driver.sh`. Builds a single driver, if needed."
  (:require [build-drivers.build-driver :as build-driver]
            [colorize.core :as colorize]))

(defn -main [& [driver]]
  (try
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m build-driver <driver>" {})))
    (build-driver/build-driver! (keyword driver))
    (System/exit 0)
    (catch Throwable e
      (println (colorize/red (pr-str e)))
      (System/exit -1))))
