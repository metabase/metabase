(ns hooks.test-util
  "Helpers for hook tests that need a real kondo run over namespaces already in kondo's cache."
  (:require
   [clj-kondo.core :as kondo]
   [clojure.java.io :as io]))

(set! *warn-on-reflection* true)

(defn- delete-tree! [^java.io.File f]
  (when (.isDirectory f)
    (run! delete-tree! (.listFiles f)))
  (.delete f))

(defn write-files!
  "Write `files`, a map of relative path to content, under the directory `dir`."
  [dir files]
  (doseq [[path content] files]
    (io/make-parents dir path)
    (spit (io/file dir path) content)))

(defn with-cached-sources!
  "Lint `src-files`, a map of relative path to content, into a fresh kondo cache.
   Then call `f` with the cache directory and a temporary directory for more files, and return what it returns.
   Deletes both directories afterwards."
  [src-files f]
  ;; A hook that reads `hooks/ns-analysis` only sees a namespace once kondo has analysed it and written the cache.
  (let [tmp-dir (.toFile (java.nio.file.Files/createTempDirectory
                          "hook-test" (into-array java.nio.file.attribute.FileAttribute [])))
        cache   (str (io/file tmp-dir "cache"))
        src     (io/file tmp-dir "src")]
    (try
      (write-files! src src-files)
      (kondo/run! {:lint       [(str src)]
                   :cache-dir  cache
                   :config-dir ".clj-kondo"})
      (f cache (io/file tmp-dir "more"))
      (finally (delete-tree! tmp-dir)))))
