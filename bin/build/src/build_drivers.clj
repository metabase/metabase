(ns build-drivers
  "Entrypoint for `bin/build-drivers.sh`. Builds all drivers, if needed."
  (:require
   [build-drivers.build-driver :as build-driver]
   [clojure.java.io :as io]
   [metabuild-common.core :as u])
  (:import
   (java.io File)))

(defn- all-drivers []
  (->> (.listFiles (io/file (u/filename u/project-root-directory "modules" "drivers")))
       (filter (fn [^File d]                                        ;
                 (and
                  ;; watch for errant DS_Store files on os_x
                  (.isDirectory d)
                  ;; ignore stuff like .cpcache
                  (not (.isHidden d))
                  ;; only consider a directory to be a driver if it contains a lein or deps build file
                  (.exists (io/file d "deps.edn")))))
       (map (comp keyword #(.getName ^File %)))))

(defn build-drivers! [edition]
  (let [edition (or edition :oss)]
    (assert (#{:oss :ee} edition))
    (u/step (format "Building all drivers (%s edition)" (pr-str edition))
      (doseq [driver (all-drivers)]
        (build-driver/build-driver! driver edition))
      (u/announce "Successfully built all drivers."))))

(defn build-drivers
  "CLI entrypoint."
  [{:keys [edition]}]
  (u/exit-when-finished-nonzero-on-exception
    (build-drivers! (u/parse-as-keyword edition))))
