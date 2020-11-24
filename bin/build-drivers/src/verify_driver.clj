(ns verify-driver
  "Entrypoint for `bin/verify-driver`. Verify that a driver JAR looks correct."
  (:require [build-drivers.verify :as verify]
            [metabuild-common.core :as u]))

(defn -main [& [driver]]
  (u/exit-when-finished-nonzero-on-exception
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m verify-driver <driver>" {})))
    (verify/verify-driver (keyword driver))))
