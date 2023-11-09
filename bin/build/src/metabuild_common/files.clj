(ns metabuild-common.files
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabuild-common.misc :as misc]
   [metabuild-common.output :as out]
   [metabuild-common.shell :as shell]
   [metabuild-common.steps :as steps])
  (:import
   (java.io File FileInputStream FileOutputStream)
   (java.nio.file
    FileSystems
    FileVisitOption
    Files
    Path
    Paths)
   (java.util.function BiPredicate)
   (java.util.zip ZipEntry ZipOutputStream)
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

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

(defn create-directory-unless-exists!
  "Create a directory if it does not already exist. Returns `dir`."
  ^String [^String dir]
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

(defn copy-file!
  "Copy a `source` file (or directory, recursively) to `dest`."
  [^String source ^String dest]
  (let [source-file (File. (assert-file-exists source))]
    ;; Use native `cp` rather than FileUtils or the like because codesigning is broken when you use those because they
    ;; don't preserve symlinks or something like that.
    (if (.isDirectory source-file)
      (steps/step (format "Copying directory %s -> %s" source dest)
        (shell/sh "cp" "-R" source dest))
      (steps/step (format "Copying file %s -> %s" source dest)
        (shell/sh "cp" source dest))))
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
  "Root directory of the Metabase repo, e.g. `/users/cam/metabase`. Determined based on its location relative to this
  source file."
  (.. (Paths/get (.toURI (io/resource "metabuild_common/files.clj")))
      toFile
      getParentFile   ; /home/cam/metabase/bin/build/src/metabuild_common/
      getParentFile   ; /home/cam/metabase/bin/build/src/
      getParentFile   ; /home/cam/metabase/bin/build/
      getParentFile   ; /home/cam/metabase/bin/
      getParentFile   ; /home/cam/metabase/
      getCanonicalPath))

(defn download-file!
  "Download a file from `url` to `dest-path` using `wget`."
  [url dest-path]
  {:pre [(string? url) (string? dest-path) (str/starts-with? url "http")]}
  (steps/step (format "Download %s -> %s" url dest-path)
    (delete-file-if-exists! dest-path)
    (shell/sh {:quiet? true} "wget" "--quiet" "--no-cache" "--output-document" dest-path url)
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

(defn absolute?
  "Whether `file` is an absolute path."
  [file]
  (.isAbsolute (io/file file)))

(defn directory?
  "Whether `file` is a directory."
  [file]
  (.isDirectory (io/file file)))

(defn exists?
  "Whether `file` exists or not."
  [file]
  (.exists (io/file file)))

(defn zip-directory->file
  "Given a source directory and a destination zip file path,
   zip the directory and writes it to the destination"
  ([source-dir zip-file]
   (zip-directory->file source-dir zip-file {}))
  ([^String source-dir ^String zip-file {:keys [_verbose]}]
   (let [verbose true
         ^File source-path (File. source-dir)
         entry-count (atom 0)]
     (when-not (exists? source-path)
       (throw (ex-info "Directory to zip must exist!" {:source-path source-path})))
     (with-open [fos (FileOutputStream. ^String zip-file)
                 zos (ZipOutputStream. fos)]
       (doseq [^File file (file-seq source-path)
               :when (not (directory? file))
               :when
               #_{:clj-kondo/ignore [:discouraged-var]}
               (or (str/ends-with? (str/lower-case file) "yaml")
                   (str/ends-with? (str/lower-case file) "yml"))]
         (when verbose (out/safe-println "Zipping file:" file))
         (let [file-path (.getAbsolutePath file)
               buffer (byte-array 1024)
               fis (FileInputStream. file)]
           (swap! entry-count inc)
           (.putNextEntry zos (ZipEntry. file-path))
           (loop [len (.read fis buffer)]
             (when (pos? len)
               (.write zos buffer 0 len)
               (recur (.read fis buffer))))
           (.closeEntry zos))))
     (out/announce "%d Entries zipped to '%s'!" @entry-count zip-file))))
