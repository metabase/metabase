(ns build-drivers.strip-and-compress
  (:require [build-drivers.common :as c]
            [build-drivers.plugin-manifest :as manifest]
            [metabuild-common.core :as u])
  (:import java.io.FileOutputStream
           [java.util.zip ZipEntry ZipFile ZipOutputStream]
           org.apache.commons.io.IOUtils))

(def ^:private files-to-always-include
  "Files to always include regardless of whether they are present in blacklist JAR."
  #{"metabase-plugin.yaml"})

(defn- jar-contents
  "Get a set of all files in a JAR that we should strip out from the driver JAR -- either the Metabase uberjar itself or
  a parent driver JAR."
  [^String jar-path]
  (with-open [zip-file (ZipFile. jar-path)]
    (set
     (for [^ZipEntry zip-entry (enumeration-seq (.entries zip-file))
           :let                [filename (str zip-entry)]
           :when               (not (files-to-always-include filename))]
       filename))))

(defn- strip-classes! [^String driver-jar-path ^String blacklist-jar-path]
  (u/step (format "Remove classes from %s that are present in %s and recompress" driver-jar-path blacklist-jar-path)
    (let [jar-contents (jar-contents blacklist-jar-path)
          temp-driver-jar-path  "/tmp/driver.jar"
          wrote           (atom 0)
          skipped         (atom 0)]
      (u/delete-file-if-exists! temp-driver-jar-path)
      (with-open [source-zip (ZipFile. (u/assert-file-exists driver-jar-path))
                  os         (doto (ZipOutputStream. (FileOutputStream. temp-driver-jar-path))
                               (.setMethod ZipOutputStream/DEFLATED)
                               (.setLevel 9))]
        (doseq [^ZipEntry entry (enumeration-seq (.entries source-zip))]
          (if (jar-contents (str entry))
            (swap! skipped inc)
            (with-open [is (.getInputStream source-zip entry)]
              (.putNextEntry os (ZipEntry. (.getName entry)))
              (IOUtils/copy is os)
              (.closeEntry os)
              (swap! wrote inc)))))
      (u/announce (format "Done. wrote: %d skipped: %d" @wrote @skipped))
      (u/safe-println (format "Original size: %s" (u/format-bytes (u/file-size driver-jar-path))))
      (u/safe-println (format "Stripped/extra-compressed size: %s" (u/format-bytes (u/file-size temp-driver-jar-path))))
      (u/step "replace the original source JAR with the stripped one"
        (u/delete-file-if-exists! driver-jar-path)
        (u/copy-file! temp-driver-jar-path driver-jar-path)))))

(defn strip-and-compress-uberjar!
  "Remove any classes in compiled `driver` that are also present in the Metabase uberjar or parent drivers. The classes
  will be available at runtime, and we don't want to make things unpredictable by including them more than once in
  different drivers.

  This is only needed because `lein uberjar` does not seem to reliably exclude classes from `:provided` Clojure
  dependencies like `metabase-core` and the parent drivers."
  [driver]
  (u/step (str (format "Strip out any classes in %s driver JAR found in core Metabase uberjar or parent JARs" driver)
               " and recompress with higher compression ratio")
    (let [driver-jar-path (u/assert-file-exists (c/driver-jar-build-path driver))]
      (u/step "strip out any classes also found in the core Metabase uberjar"
        (strip-classes! driver-jar-path (u/assert-file-exists c/metabase-uberjar-path)))
      (u/step "remove any classes also found in any of the parent JARs"
        (doseq [parent (manifest/parent-drivers driver)]
          (strip-classes! driver-jar-path (u/assert-file-exists (c/driver-jar-build-path parent))))))))
