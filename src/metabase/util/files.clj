(ns metabase.util.files
  "Low-level file-related functions for implementing Metabase plugin functionality. These use the `java.nio.file`
  library rather than the usual `java.io` stuff because it abstracts better across different filesystems (such as
  files in a normal directory vs files inside a JAR.)

  As much as possible, this namespace aims to abstract away the `nio.file` library and expose a set of high-level
  *file-manipulation* functions for the sorts of operations the plugin system needs to perform."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (java.io FileNotFoundException)
   (java.net URL)
   (java.nio.file CopyOption Files FileSystem FileSystemAlreadyExistsException FileSystems
                  LinkOption OpenOption Path Paths StandardCopyOption)
   (java.nio.file.attribute FileAttribute)
   (java.util Collections)
   (java.util.zip ZipInputStream)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Path Utils ---------------------------------------------------

(defn- get-path-in-filesystem ^Path [^FileSystem filesystem ^String path-component & more-components]
  (.getPath filesystem path-component (u/varargs String more-components)))

(defn get-path
  "Get a `Path` for a file or directory in the default (i.e., system) filesystem named by string path component(s).

    (get-path \"/Users/cam/metabase/metabase/plugins\")
    ;; -> #object[sun.nio.fs.UnixPath 0x4d378139 \"/Users/cam/metabase/metabase/plugins\"]"
  ^Path [& path-components]
  (apply get-path-in-filesystem (FileSystems/getDefault) path-components))

(defn append-to-path
  "Appends string `components` to the end of a Path, returning a new Path."
  ^Path [^Path path & components]
  (loop [^Path path path, [^String component & more] components]
    (let [path (.resolve path component)]
      (if-not (seq more)
        path
        (recur path more)))))

;;; ----------------------------------------------- Other Basic Utils ------------------------------------------------

(defn exists?
  "Does file at `path` actually exist?"
  [^Path path]
  (Files/exists path (u/varargs LinkOption)))

(defn regular-file?
  "True if `path` refers to a regular file (as opposed to something like directory)."
  [^Path path]
  (Files/isRegularFile path (u/varargs LinkOption)))

(defn readable?
  "True if we can read the file at `path`."
  [^Path path]
  (Files/isReadable path))


;;; ----------------------------------------------- Working with Dirs ------------------------------------------------

(defn create-dir-if-not-exists!
  "Self-explanatory. Create a directory with `path` if it does not already exist."
  [^Path path]
  (when-let [parent (fs/parent path)]
    (create-dir-if-not-exists! parent))
  (when-not (exists? path)
    (Files/createDirectory path (u/varargs FileAttribute))))

(defn files-seq
  "Get a sequence of all files in `path`, presumably a directory or an archive of some sort (like a JAR)."
  [^Path path]
  (iterator-seq (.iterator (Files/list path))))


;;; ------------------------------------------------- Copying Stuff --------------------------------------------------

(defn- last-modified-timestamp ^java.time.Instant [^Path path]
  (when (exists? path)
    (.toInstant (Files/getLastModifiedTime path (u/varargs LinkOption)))))

(defn copy-file!
  "Copy a file from `source` -> `dest`."
  [^Path source ^Path dest]
  (when (or (not (exists? dest))
            (not= (last-modified-timestamp source) (last-modified-timestamp dest)))
    (log/infof "Extract file %s -> %s" source dest)
    (Files/copy source dest (u/varargs CopyOption [StandardCopyOption/REPLACE_EXISTING
                                                   StandardCopyOption/COPY_ATTRIBUTES]))))

(defn copy-files!
  "Copy all files in `source-dir` to `dest-dir`. Overwrites existing files if last modified timestamp is not the same as
  that of the source file — see #11699 for more context."
  [^Path source-dir, ^Path dest-dir]
  (doseq [^Path source (files-seq source-dir)
          :let         [target (append-to-path dest-dir (str (.getFileName source)))]]
    (try
      (copy-file! source target)
      (catch Throwable e
        (log/error e "Failed to copy file")))))


;;; ------------------------------------------ Opening filesystems for URLs ------------------------------------------

(defn- url-inside-jar? [^URL url]
  (when url
    (str/includes? (.getFile url) ".jar!/")))

(defn- jar-file-system-from-url ^FileSystem [^URL url]
  (let [uri (.toURI url)]
    (try
      (FileSystems/newFileSystem uri Collections/EMPTY_MAP)
      (catch FileSystemAlreadyExistsException _
        (log/info "File system at" uri "already exists")
        (FileSystems/getFileSystem uri)))))

(defn do-with-open-path-to-resource
  "Impl for `with-open-path-to-resource`."
  [^String resource f]
  (let [url (io/resource resource)]
    (when-not url
      (throw (FileNotFoundException. (trs "Resource does not exist."))))
    (if (url-inside-jar? url)
      (with-open [fs (jar-file-system-from-url url)]
        (f (get-path-in-filesystem fs "/" resource)))
      (f (get-path (.toString (Paths/get (.toURI url))))))))

(defmacro with-open-path-to-resource
  "Execute `body` with a Path to a resource file or directory (i.e. a file in the project `resources/` directory, or
  inside the uberjar), cleaning up when finished.

  Throws a FileNotFoundException if the resource does not exist; be sure to check with `io/resource` or similar before
  calling this.

    (with-open-path-to-resouce [path \"modules\"]
       ...)"
  [[path-binding resource-filename-str] & body]
  `(do-with-open-path-to-resource
    ~resource-filename-str
    (fn [~(vary-meta path-binding assoc :tag java.nio.file.Path)]
      ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               JAR FILE CONTENTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn file-exists-in-archive?
  "True is a file exists in an archive."
  [^Path archive-path & path-components]
  (with-open [fs (FileSystems/newFileSystem archive-path (ClassLoader/getSystemClassLoader))]
    (let [file-path (apply get-path-in-filesystem fs path-components)]
      (exists? file-path))))

(defn slurp-file-from-archive
  "Read the entire contents of a file from a archive (such as a JAR)."
  [^Path archive-path & path-components]
  (with-open [fs (FileSystems/newFileSystem archive-path (ClassLoader/getSystemClassLoader))]
    (let [file-path (apply get-path-in-filesystem fs path-components)]
      (when (exists? file-path)
        (with-open [is (Files/newInputStream file-path (u/varargs OpenOption))]
          (slurp is))))))

(defn unzip-file
  "Decompress a zip archive from input to output."
  [zip-file mod-fn]
  (with-open [stream (-> zip-file io/input-stream ZipInputStream.)]
    (loop [entry (.getNextEntry stream)]
      (when entry
        (let [out-path (mod-fn (.getName entry))
              out-file (io/file out-path)]
          (if (.isDirectory entry)
            (when-not (.exists out-file) (.mkdirs out-file))
            (let [parent-dir (fs/parent out-path)]
              (when-not (fs/exists? (str parent-dir)) (fs/create-dirs parent-dir))
              (io/copy stream out-file)))
          (recur (.getNextEntry stream)))))))

(defn relative-path
  "Returns a java.nio.file.Path "
  [path]
  (fs/relativize (fs/absolutize ".") path))
