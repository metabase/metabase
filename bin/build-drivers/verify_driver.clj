(ns verify-driver
  (:require [build-drivers.verify :as verify]
            [colorize.core :as colorize]))

(defn -main [& [driver]]
  (try
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m verify-driver <driver>" {})))
    (verify/verify-driver (keyword driver))
    (System/exit 0)
    (catch Throwable e
      (println (colorize/red (pr-str e)))
      (System/exit -1))))
