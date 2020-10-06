(ns build-drivers
  (:require [build-drivers
             [build-driver :as build-driver]
             [common :as c]
             [util :as u]]
            [clojure.java.io :as io]
            [colorize.core :as colorize]))

(defn- build-drivers! []
  (u/step "Building all drivers"
    (doseq [driver (map keyword (.list (io/file (c/filename c/project-root-directory "modules" "drivers"))))]
      (build-driver/build-driver! driver))
    (u/announce "Successfully built all drivers.")))

(defn -main []
  (try
    (build-drivers!)
    (System/exit 0)
    (catch Throwable e
      (println (colorize/red (pr-str e)))
      (System/exit -1))))
