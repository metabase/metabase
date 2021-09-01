(ns metabuild-common.files
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.misc :as misc]
            [metabuild-common.output :as out]
            [metabuild-common.shell :as sh]
            [metabuild-common.steps :as steps])
  (:import java.io.File
           [java.nio.file Files FileSystems FileVisitOption Path Paths]
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
  (steps/step (format "Create directory %s if it does not exist" dir)
    (if (file-exists? dir)
      (out/announce "%s already exists." dir)
      (steps/step (format "Create directory %s" dir)
        (.mkdirs (File. dir)))))
  dir)

(defn delete-file-if-exists!
  "Delete a file or directory (recursively) if it exists."
  ([^String filename]
   (steps/step (format "Delete %s if exists" filename)
     (if (file-exists? filename)
       (let [file (File. filename)]
         (if (.isDirectory file)
           (FileUtils/deleteDirectory file)
           (.delete file))
         (out/safe-println (format "Deleted %s." filename)))
       (out/safe-println (format "Don't need to delete %s, file does not exist." filename)))
     (assert (not (file-exists? filename)))))

  ([file & more]
   (dorun (map delete-file-if-exists! (cons file more)))))

(defn ^:deprecated delete-file!
  "Alias for `delete-file-if-exists!`. Here for backwards compatibility. Prefer `delete-file-if-exists!` going
  forward."
  [& args]
  (apply delete-file-if-exists! args))

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

(defn filename
  "Create a filename path String by joining path components:

    (filename \"usr\" \"cam\" \".emacs.d\" \"init.el\")
    ;; -> \"usr/cam/.emacs.d/init.el\""
  [& path-components]
  (str/join File/separatorChar path-components))

(def ^String project-root-directory
  "Root directory of the Metabase repo, e.g. `/users/cam/metabase`. Determined by finding the directory that has
  `project.clj` in it."
  (loop [^File dir (File. ^String (env/env :user-dir))]
    (cond
      (file-exists? (filename (.getAbsolutePath dir) "project.clj"))
      (.getAbsolutePath dir)

      (.getParentFile dir)
      (recur (.getParentFile dir))

      :else
      (throw (ex-info (format "Can't find project root directory: no parent directory of %s has a project.clj file"
                              (env/env :user-dir))
                      {:dir (env/env :user-dir)})))))

(defn download-file!
  "Download a file from `url` to `dest-path` using `wget`."
  [url dest-path]
  {:pre [(string? url) (string? dest-path) (str/starts-with? url "http")]}
  (steps/step (format "Download %s -> %s" url dest-path)
    (delete-file-if-exists! dest-path)
    (sh/sh {:quiet? true} "wget" "--quiet" "--no-cache" "--output-document" dest-path url)
    (assert-file-exists dest-path)))

(defn nio-path
  "Convert a String `path` to a `java.nio.file.Path`, for use with NIO methods."
  ^Path [^String path]
  (.getPath (FileSystems/getDefault) path (misc/varargs String)))

(defn file-size
  "Get the size, in bytes, of the file at `path`."
  ^Long [^String path]
  (Files/size (nio-path path)))

(defn temporary-file
  "Create a temporary file with prefix and suffix. Default to delete on exit."
  ([prefix suffix] (temporary-file prefix suffix true))
  ([prefix suffix delete-on-exit?]
   (let [file (File/createTempFile prefix suffix)]
     (when delete-on-exit?
       (.deleteOnExit file))
     file)))
