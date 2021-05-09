(ns build-drivers
  "Entrypoint for `bin/build-drivers.sh`. Builds all drivers, if needed."
  (:require [build-drivers.build-driver :as build-driver]
            [clojure.java.io :as io]
            [metabuild-common.core :as u]))

(defn- all-drivers []
  (->> (.listFiles (io/file (u/filename u/project-root-directory "modules" "drivers")))
       (filter #(.isDirectory %)) ;; watch for errant DS_Store files on os_x
       (map (comp keyword #(.getName %)))))

(defn build-drivers! [edition]
  (let [edition (or edition :oss)]
    (assert (#{:oss :ee} edition))
    (u/step (format "Building all drivers (%s edition)" (pr-str edition))
      (doseq [driver (all-drivers)]
        (build-driver/build-driver! driver edition))
      (u/announce "Successfully built all drivers."))))

(defn -main [& [edition]]
  (u/exit-when-finished-nonzero-on-exception
    (build-drivers! (keyword edition))))
