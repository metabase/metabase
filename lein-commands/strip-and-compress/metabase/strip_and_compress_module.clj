(ns metabase.strip-and-compress-module
  (:require [metabase.util :as u])
  (:import [java.nio.file CopyOption Files FileSystems OpenOption]
           java.nio.file.attribute.FileAttribute
           [java.util.zip ZipEntry ZipFile ZipOutputStream]
           org.apache.commons.io.IOUtils))

(defn- files-in-mb-jar
  "Get a set of all files in the Metabase uberjar."
  []
  (with-open [zip-file (ZipFile. "target/uberjar/metabase.jar")]
    (set
     (for [^ZipEntry zip-entry (enumeration-seq (.entries zip-file))]
       (str zip-entry)))))

(defn -main
  "Remove any classes from a module JAR that are also found in the Metabase uberjar. Compress the module JAR using the
  maximum compression level, shrinking the size to an amazingly small level."
  [& [source]]
  (println (format "Stripping duplicate classes and extra-compressing %s..." source))
  (let [files-in-mb-jar (files-in-mb-jar)
        temp-file-path  (Files/createTempFile "driver" ".jar" (u/varargs FileAttribute))
        wrote           (atom 0)
        skipped         (atom 0)]
    (with-open [source-zip (ZipFile. source)]
      (with-open [os (doto (ZipOutputStream. (Files/newOutputStream temp-file-path (u/varargs OpenOption)))
                       (.setMethod ZipOutputStream/DEFLATED)
                       (.setLevel 9))]
        (doseq [^ZipEntry entry (enumeration-seq (.entries source-zip))]
          (if (files-in-mb-jar (str entry))
            (swap! skipped inc)
            (with-open [is (.getInputStream source-zip entry)]
              (.putNextEntry os (ZipEntry. (.getName entry)))
              (IOUtils/copy is os)
              (.closeEntry os)
              (swap! wrote inc))))))
    (println (format "Done. wrote: %d skipped: %d" @wrote @skipped))
    (let [source-path (.getPath (FileSystems/getDefault) source (u/varargs String))]
      (println "Original size:" (u/format-bytes (Files/size source-path)))
      (println "Stripped/extra-compressed size:" (u/format-bytes (Files/size temp-file-path)))
      ;; Now replace the original source JAR with the stripped one
      (Files/delete source-path)
      (Files/move temp-file-path source-path (u/varargs CopyOption)))))
