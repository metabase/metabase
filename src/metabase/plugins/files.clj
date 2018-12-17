(ns metabase.plugins.files
  "Low-level file-related functions for implementing Metabase plugin functionality. These use the `java.nio.file`
  library rather than the usual `java.io` stuff because it abstracts better across different filesystems (such as
  files in a normal directory vs files inside a JAR.)

  As much as possible, this namespace aims to abstract away the `nio.file` library and expose a set of high-level
  *file-manipulation* functions for the sorts of operations the plugin system needs to perform."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase
             [jar-compression :as jar-compression]
             [util :as u]]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]])
  (:import java.io.FileNotFoundException
           java.net.URL
           [java.nio.file Files FileSystem FileSystems LinkOption OpenOption Path]
           java.nio.file.attribute.FileAttribute
           java.util.Collections
           org.apache.commons.io.IOUtils))

;;; --------------------------------------------------- Path Utils ---------------------------------------------------

(defn- get-path-in-filesystem ^Path [^FileSystem filesystem, ^String path-component & more-components]
  (.getPath filesystem path-component (u/varargs String more-components)))

(defn get-path
  "Get a `Path` for a file or directory in the default (i.e., system) filesystem named by string path component(s).

    (get-path \"/Users/cam/metabase/metabase/plugins\")
    ;; -> #object[sun.nio.fs.UnixPath 0x4d378139 \"/Users/cam/metabase/metabase/plugins\"]"
  ^Path [& path-components]
  (apply get-path-in-filesystem (FileSystems/getDefault) path-components))

(defn- append-to-path ^Path [^Path path & components]
  (loop [^Path path path, [^String component & more] components]
    (let [path (.resolve path component)]
      (if-not (seq more)
        path
        (recur path more)))))

;;; ----------------------------------------------- Other Basic Utils ------------------------------------------------

(defn- exists? [^Path path]
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
  (when-not (exists? path)
    (Files/createDirectory path (u/varargs FileAttribute))))

(defn files-seq
  "Get a sequence of all files in `path`, presumably a directory or an archive of some sort (like a JAR)."
  [^Path path]
  (iterator-seq (.iterator (Files/list path))))


;;; ------------------------------------------------- Copying Stuff --------------------------------------------------

(defn- copy! [compressed?, ^Path source, ^Path dest]
  (du/profile (trs "Extract file {0} -> {1}" source dest)
    (if compressed?
      (jar-compression/decompress! source, :out dest)
      (with-open [is (Files/newInputStream source (u/varargs OpenOption))
                  os (Files/newOutputStream dest (u/varargs OpenOption))]
        (IOUtils/copy is os)))))

(defn- copy-if-not-exists! [compressed?, ^Path source, ^Path dest]
  (when-not (exists? dest)
    (copy! compressed? source dest)))

(defn- copy-source! [^Path dest-dir, ^Path source]
  (let [filename              (str (.getFileName source))
        [_ decompressed-name] (re-matches #"(^.*\.jar)((?:\.pack)?(?:\.[^\.]+)$)" filename)
        target                (append-to-path dest-dir (or decompressed-name filename))]
    (copy-if-not-exists! (boolean decompressed-name) source target)))

(defn copy-files-if-not-exists!
  "Copy all files in `source-dir` to `dest-dir`; skip files if a file of the same name already exists in `dest-dir`."
  [^Path source-dir, ^Path dest-dir]
  (dorun (pmap (partial copy-source! dest-dir) (files-seq source-dir))))


;;; ------------------------------------------ Opening filesystems for URLs ------------------------------------------

(defn- url-inside-jar? [^URL url]
  (when url
    (str/includes? (.getFile url) ".jar!/")))

(defn- jar-file-system-from-url ^FileSystem [^URL url]
  (FileSystems/newFileSystem (.toURI url) Collections/EMPTY_MAP))

(defn do-with-open-path-to-resource
  "Impl for `with-open-path-to-resource`."
  [^String resource, f]
  (let [url (io/resource resource)]
    (when-not url
      (throw (FileNotFoundException. (str (trs "Resource does not exist.")))))
    (if (url-inside-jar? url)
      (with-open [fs (jar-file-system-from-url url)]
        (f (get-path-in-filesystem fs "/" resource)))
      (f (get-path (.getPath url))))))

(defmacro with-open-path-to-resource
  "Execute `body` with an Path to a resource file (i.e. a file in the project `resources/` directory), cleaning up when
  finished.

  Throws a FileNotFoundException if the resource does not exist; be sure to check with `io/resource` or similar before
  calling this."
  [[path-binding resource-filename-str] & body]
  `(do-with-open-path-to-resource
    ~resource-filename-str
    (fn [~(vary-meta path-binding assoc :tag java.nio.file.Path)]
      ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               JAR FILE CONTENTS                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn slurp-file-from-archive
  "Read the entire contents of a file from a archive (such as a JAR)."
  [^Path archive-path & path-components]
  (with-open [fs (FileSystems/newFileSystem archive-path (ClassLoader/getSystemClassLoader))]
    (let [file-path (apply get-path-in-filesystem fs path-components)]
      (when (exists? file-path)
        (with-open [is (Files/newInputStream file-path (u/varargs OpenOption))]
          (slurp is))))))
