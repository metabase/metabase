(ns test-driver
  "Entrypoint for `bin/test-driver`. Runs the Metabase test suite against a driver."
  (:require [build-drivers.test :as test]
            [metabuild-common.core :as u]))

(defn -main [& [driver]]
  (u/exit-when-finished-nonzero-on-exception
    (when-not (seq driver)
      (throw (ex-info "Usage: clojure -m test-driver <driver>" {})))
    (test/verify-driver (u/parse-as-keyword driver))))
