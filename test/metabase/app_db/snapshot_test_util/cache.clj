(ns metabase.app-db.snapshot-test-util.cache
  "Snapshots shared within one test run. Each test gets a separate database."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mb.hawk.hooks :as hooks]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [methodical.core :as methodical])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defonce ^:private run-cache (atom nil))

(defn clear!
  "Delete the current run's snapshot files and clear its cache."
  []
  (locking run-cache
    (when-let [directory (:directory @run-cache)]
      (fs/delete-tree directory))
    (reset! run-cache nil)))

(methodical/defmethod hooks/before-run ::snapshots
  "Start each test run without cached snapshots."
  [_options]
  (clear!))

(methodical/defmethod hooks/after-run ::snapshots
  "Delete cached snapshots after a successful or failed test run."
  [_options]
  (clear!))

(defn- check-request [flavor through-id]
  (when-not (snapshot/flavors flavor)
    (throw (ex-info "Unsupported snapshot flavor" {:flavor flavor})))
  (when-not (and (string? through-id) (not (str/blank? through-id)))
    (throw (ex-info "A migration boundary changeset ID is required" {:through-changeset-id through-id})))
  (when-not (snapshot/matches-environment?)
    (throw (ex-info "Cached snapshots require encryption to be disabled" {}))))

(defn- cache-directory! []
  (or (:directory @run-cache)
      (let [directory (fs/create-temp-dir {:prefix "metabase-app-db-snapshots-"})]
        (reset! run-cache {:directory directory})
        directory)))

(defn- generate-entry! [flavor create-snapshot!]
  (let [content (create-snapshot!)
        file (File/createTempFile (str (name flavor) "-") ".sql" (fs/file (cache-directory!)))]
    (try
      (spit file content)
      file
      (catch Throwable e
        (io/delete-file file true)
        (throw e)))))

(defn ensure-snapshot!
  "Return a SQL file for the inclusive changeset ID until this test run ends.
  Call `create-snapshot!` on a cache miss to produce validated SQL. Failed creation can be retried."
  ^File [flavor through-id create-snapshot!]
  (check-request flavor through-id)
  (locking run-cache
    (or (get-in @run-cache [:files [flavor through-id]])
        (let [file (generate-entry! flavor create-snapshot!)]
          (swap! run-cache assoc-in [:files [flavor through-id]] file)
          file))))
