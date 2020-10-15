(ns metabuild-common.files
  (:require [metabuild-common
             [output :as out]
             [shell :as sh]
             [steps :as steps]])
  (:import java.io.File
           [java.nio.file Files FileVisitOption Path Paths]
           java.util.function.BiPredicate
           org.apache.commons.io.FileUtils))

(defn file-exists?
  "Does a file or directory with `filename` exist?"
  [^String filename]
  (when filename
    (.exists (File. filename))))

(defn assert-file-exists
  "If file with `filename` exists, return `filename` as is; otherwise, throw Exception."
  ^String [filename & [message]]
  (when-not (file-exists? filename)
    (throw (ex-info (format "File %s does not exist. %s" (pr-str filename) (or message "")) {:filename filename})))
  (str filename))

(defn create-directory-unless-exists! [^String dir]
  (when-not (file-exists? dir)
    (steps/step (format "Creating directory %s..." dir)
      (.mkdirs (File. dir))))
  dir)

(defn delete-file!
  "Delete a file or directory (recursively) if it exists."
  ([^String filename]
   (steps/step (format "Deleting %s..." filename)
     (if (file-exists? filename)
       (let [file (File. filename)]
         (if (.isDirectory file)
           (FileUtils/deleteDirectory file)
           (.delete file))
         (out/safe-println (format "Deleted %s." filename)))
       (out/safe-println (format "Don't need to delete %s, file does not exist." filename)))
     (assert (not (file-exists? filename)))))

  ([file & more]
   (dorun (map delete-file! (cons file more)))))

(defn copy-file!
  "Copy a `source` file (or directory, recursively) to `dest`."
  [^String source ^String dest]
  (let [source-file (File. (assert-file-exists source))
        dest-file   (File. dest)]
    ;; Use native `cp` rather than FileUtils or the like because codesigning is broken when you use those because they
    ;; don't preserve symlinks or something like that.
    (if (.isDirectory source-file)
      (steps/step (format "Copying directory %s -> %s" source dest)
        (sh/sh "cp" "-R" source dest))
      (steps/step (format "Copying file %s -> %s" source dest)
        (sh/sh "cp" source dest))))
  (assert-file-exists dest))

(defn- ->URI ^java.net.URI [filename]
  (java.net.URI. (str "file://" filename)))

(defn- ->Path ^Path [filename]
  (Paths/get (->URI filename)))

(defn find-files
  "Pure Java version of `find`. Recursively find files in `dir-path` that satisfy `pred`, which has the signature

    (pred filename-string) -> Boolean"
  [^String dir-path pred]
  (->> (Files/find (->Path dir-path)
                   Integer/MAX_VALUE
                   (reify BiPredicate
                     (test [_ path _]
                       (boolean (pred (str path)))))
                   ^FileVisitOption (make-array FileVisitOption 0))
       .toArray
       (map str)
       sort))
