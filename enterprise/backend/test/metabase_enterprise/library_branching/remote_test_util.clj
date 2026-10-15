(ns metabase-enterprise.library-branching.remote-test-util
  "The remote of the tests: a bare repository in a new temporary directory, reached by a file:// URL."
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)))

(set! *warn-on-reflection* true)

(defn do-with-bare-remote
  "Calls `(f repo url)`: `repo` is a new empty bare repository in a new temporary directory, and `url` its file:// URL.
  A push to it starts no gc. Removes the directory after."
  [f]
  (let [dir (.toFile (Files/createTempDirectory "library-branching-remote-" (make-array FileAttribute 0)))]
    (try
      (with-open [git (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))]
        (let [repo (.getRepository git)]
          ;; A file:// push runs receive-pack in this JVM, and receive-pack starts an automatic gc of the remote on a
          ;; thread of its own. That gc holds gc.log.lock in `dir` while the `finally` below removes `dir`.
          (doto (.getConfig repo)
            (.setBoolean "receive" nil "autogc" false)
            (.save))
          (f repo (str "file://" (.getAbsolutePath ^File dir)))))
      (finally
        (FileUtils/deleteDirectory dir)))))
