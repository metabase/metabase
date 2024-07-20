(ns build-drivers.copy-source-files
  (:require
   [build-drivers.common :as c]
   [clojure.java.io :as io]
   [metabuild-common.core :as u])
  (:import (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn- copy-files [src-dirs target-dir]
  (doseq [src-dir src-dirs]
    (let [src (io/file src-dir)
          target (io/file target-dir)]
      (when (.exists src)
        (u/announce "Copying files from %s to %s" src target)
        (doseq [file (file-seq src)]
          (when (.isFile file)
            (let [relative-path (.relativize (.toPath src) (.toPath file))
                  target-file (io/file target (str relative-path))]
              (.mkdirs (.getParentFile target-file))
              (Files/copy (.toPath file) (.toPath target-file) (into-array java.nio.file.CopyOption [])))))))))

(defn copy-source-files!
  "Copy source files into the build driver JAR."
  [driver edition]
  (u/step (format "Copy %s source files" driver)
    (let [start-time-ms (System/currentTimeMillis)
          dirs          (:paths (c/driver-edn driver edition))]
      (assert (every? u/absolute? dirs)
              (format "All dirs should be absolute, got: %s" (pr-str dirs)))
      (u/announce "Copying files in %s" (pr-str dirs))
      (copy-files dirs (c/compiled-source-target-dir driver))
      (u/announce "Copied files in %d directories in %d ms."
                  (count dirs)
                  (- (System/currentTimeMillis) start-time-ms)))))
