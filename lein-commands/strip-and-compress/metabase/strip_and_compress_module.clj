(ns metabase.strip-and-compress-module
  (:import [java.nio.file CopyOption Files FileSystems OpenOption]
           java.nio.file.attribute.FileAttribute
           [java.util.zip ZipEntry ZipFile ZipOutputStream]
           org.apache.commons.io.IOUtils))

(defmacro ^:private varargs
  {:style/indent 1, :arglists '([klass] [klass xs])}
  [klass & [objects]]
  (vary-meta `(into-array ~klass ~objects)
             assoc :tag (format "[L%s;" (.getCanonicalName ^Class (ns-resolve *ns* klass)))))

(defn- format-bytes [num-bytes]
  (loop [n num-bytes [suffix & more] ["B" "KB" "MB" "GB"]]
    (if (and (seq more)
             (>= n 1024))
      (recur (/ n 1024.0) more)
      (format "%.1f %s" n suffix))))

(def ^:private files-to-always-include
  "Files to always include regardless of whether they are present in blacklist JAR."
  #{"metabase-plugin.yaml"})

(defn- files-blacklist
  "Get a set of all files in the Metabase uberjar."
  [^String blacklist-jar]
  (with-open [zip-file (ZipFile. blacklist-jar)]
    (set
     (for [^ZipEntry zip-entry (enumeration-seq (.entries zip-file))
           :let                [filename (str zip-entry)]
           :when               (not (files-to-always-include filename))]
       filename))))

(defn -main
  "Remove any classes from a module JAR that are also found in the Metabase uberjar. Compress the module JAR using the
  maximum compression level, shrinking the size to an amazingly small level."
  ([source]
   (-main source "target/uberjar/metabase.jar"))

  ([source blacklist-jar]
   (println (format "Stripping duplicate classes and extra-compressing %s..." source))
   (let [files-blacklist (files-blacklist blacklist-jar)
         temp-file-path  (Files/createTempFile "driver" ".jar" (varargs FileAttribute))
         wrote           (atom 0)
         skipped         (atom 0)]
     (with-open [source-zip (ZipFile. source)]
       (with-open [os (doto (ZipOutputStream. (Files/newOutputStream temp-file-path (varargs OpenOption)))
                        (.setMethod ZipOutputStream/DEFLATED)
                        (.setLevel 9))]
         (doseq [^ZipEntry entry (enumeration-seq (.entries source-zip))]
           (if (files-blacklist (str entry))
             (swap! skipped inc)
             (with-open [is (.getInputStream source-zip entry)]
               (.putNextEntry os (ZipEntry. (.getName entry)))
               (IOUtils/copy is os)
               (.closeEntry os)
               (swap! wrote inc))))))
     (println (format "Done. wrote: %d skipped: %d" @wrote @skipped))
     (let [source-path (.getPath (FileSystems/getDefault) source (varargs String))]
       (println "Original size:" (format-bytes (Files/size source-path)))
       (println "Stripped/extra-compressed size:" (format-bytes (Files/size temp-file-path)))
       (println (format "Copying to %s..." source-path))
       ;; Now replace the original source JAR with the stripped one
       (Files/delete source-path)
       (Files/move temp-file-path source-path (varargs CopyOption))))
   (System/exit 0)))
