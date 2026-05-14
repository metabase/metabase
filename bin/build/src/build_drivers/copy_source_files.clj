(ns build-drivers.copy-source-files
  (:require
   [build-drivers.common :as c]
   [clojure.java.io :as io]
   [metabuild-common.core :as u])
  (:import
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn- copy-files [src-dirs target-dir]
  (doseq [src-dir src-dirs]
    (let [src (io/file src-dir)
          target (io/file target-dir)]
      (when (.exists src)
        (u/announce "Copying files from %s to %s" src target)
        (doseq [^java.io.File file (file-seq src)]
          (when (.isFile file)
            (let [relative-path (.relativize (.toPath src) (.toPath file))
                  target-file (io/file target (str relative-path))]
              (.mkdirs (.getParentFile target-file))
              (Files/copy (.toPath file) (.toPath target-file) ^"[Ljava.nio.file.CopyOption;" (into-array java.nio.file.CopyOption [])))))))))

(defn- copy-plugin-manifest-to-root!
  "Plugin JARs loaded from the `./plugins` directory need `metabase-plugin.yaml` at the JAR root so
  the plugin loader can find it. The resource directory stores it under
  `metabase/<driver>/metabase-plugin.yaml`, so after the normal copy we duplicate it to the root of
  the target directory."
  [driver target-dir]
  (let [nested (io/file target-dir "metabase" (name driver) "metabase-plugin.yaml")
        root   (io/file target-dir "metabase-plugin.yaml")]
    (when (and (.exists nested) (not (.exists root)))
      (u/announce "Copying %s -> %s" (str nested) (str root))
      (Files/copy (.toPath nested) (.toPath root) ^"[Ljava.nio.file.CopyOption;" (into-array java.nio.file.CopyOption [])))))

(defn copy-source-files!
  "Copy source files into the build driver JAR."
  [driver edition]
  (u/step (format "Copy %s source files" driver)
    (let [timer      (u/start-timer)
          dirs       (:paths (c/driver-edn driver edition))
          target-dir (c/compiled-source-target-dir driver)]
      (assert (every? u/absolute? dirs)
              (format "All dirs should be absolute, got: %s" (pr-str dirs)))
      (u/announce "Copying files in %s" (pr-str dirs))
      (copy-files dirs target-dir)
      (copy-plugin-manifest-to-root! driver target-dir)
      (u/announce "Copied files in %d directories in %d ms."
                  (count dirs)
                  (u/since-ms timer)))))
