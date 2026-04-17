(ns metabase-enterprise.audit-app.analytics-dev.export-test
  (:require
   [clojure.data :as data]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.audit-app.analytics-dev :as analytics-dev]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.test.embedded-postgres.core :as emb-pg]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def default-target-dir
  "Canonical location of the checked-in instance analytics YAML tree."
  "resources/instance_analytics")

(def ^:private seed-user
  {:email        "internal@metabase.com"
   :first_name   "Internal"
   :last_name    "Metabase"
   :password     "not-a-real-password"
   :is_superuser true
   :is_active    true})

(defn- fresh-app-db
  [{::emb-pg/keys [host port db-name user]}]
  (mdb/application-db
   :postgres
   (mdb/broken-out-details->DataSource :postgres {:host host
                                                  :port port
                                                  :db   db-name
                                                  :user user})
   :create-pool? true))

(defn- seed-superuser! []
  (or (t2/select-one :model/User :email (:email seed-user))
      (t2/insert-returning-instance! :model/User seed-user)))

(defn- run-export!
  [target-dir]
  (audit/analytics-dev-mode! true)
  (let [user (seed-superuser!)]
    (analytics-dev/create-analytics-dev-database! (:id user) {:sync? false})
    (analytics-dev/import-analytics-content! (:email user))
    (let [collection (analytics-dev/find-analytics-collection)]
      (when-not collection
        (throw (ex-info "analytics collection not found after import" {})))
      (analytics-dev/export-analytics-content! (:id collection) (:email user) target-dir))))

(defn export!
  "Run the full analytics-dev export pipeline against a fresh embedded Postgres.
  Writes canonical YAMLs into `target-dir` (defaults to the checked-in
  `resources/instance_analytics` tree).

  One-eval REPL / test entry point that produces the instance-analytics
  canonical YAML export. Spins up an embedded Postgres, runs app-db migrations
  against it, seeds a superuser, runs the analytics-dev import pipeline, then
  re-exports the resulting collection back to the target directory.

  DWH sync and QP execution are deliberately suppressed during the run so the
  export output is purely driven by serdes round-tripping — no accidental diffs
  from synced schemas or re-computed result metadata."
  ([]
   (export! default-target-dir))
  ([target-dir]
   (log/info "Analytics-dev export starting; target-dir=" target-dir)
   (emb-pg/with-system [system {::emb-pg/db-server {}}]
     (let [db-server (::emb-pg/db-server system)]
       (mdb/with-application-db (fresh-app-db db-server)
         (mdb/setup-db! :create-sample-content? false)
         (run-export! target-dir))))))

(defn- yaml-files-relative
  "Return a map of `relative-path -> File` for every `.yaml` file under `root`."
  [^File root]
  (let [root-path (.toPath root)]
    (into {}
          (comp (filter (fn [^File f]
                          (and (.isFile f)
                               (str/ends-with? (.getName f) ".yaml"))))
                (map (fn [^File f]
                       [(str (.relativize root-path (.toPath f))) f])))
          (file-seq root))))

(defn- first-diff-line [^File a ^File b]
  (let [a-lines (str/split-lines (slurp a))
        b-lines (str/split-lines (slurp b))]
    (some (fn [[i [la lb]]]
            (when (not= la lb)
              (format "line %d: exported=%s\n           checked-in=%s" (inc i) (pr-str la) (pr-str lb))))
          (map-indexed vector (map vector a-lines (concat b-lines (repeat nil)))))))

(defn- create-tmp-dir ^File []
  (.toFile (Files/createTempDirectory "ia-export-test" (make-array FileAttribute 0))))

(deftest analytics-dev-export-matches-checked-in-test
  (testing "running the analytics-dev export produces bytes identical to the checked-in resources/instance_analytics tree"
    (let [tmp-dir     (create-tmp-dir)
          checked-in  (io/file "resources/instance_analytics")]
      (try
        (export! (.getAbsolutePath tmp-dir))
        (let [exported-files   (yaml-files-relative tmp-dir)
              checked-in-files (yaml-files-relative checked-in)
              exported-paths   (set (keys exported-files))
              checked-in-paths (set (keys checked-in-files))
              only-exported    (sort (set/difference exported-paths checked-in-paths))
              only-checked-in  (sort (set/difference checked-in-paths exported-paths))
              shared-paths     (sort (set/intersection exported-paths checked-in-paths))]
          (is (= [nil nil] (take 2 (data/diff only-checked-in only-exported))))
          (is (= [] only-exported)
              (str "files in the export that aren't checked in:\n  "
                   (str/join "\n  " only-exported)))
          (is (= [] only-checked-in)
              (str "files checked in that weren't produced by the export:\n  "
                   (str/join "\n  " only-checked-in)))
          (is (= [] (for [path shared-paths
                          :let [a (get exported-files path)
                                b (get checked-in-files path)]
                          :when (not= (slurp a) (slurp b))]
                      [path (first-diff-line a b)]))
              "Generated files should match checked-in files. You may need to regenerate checked-in files by running (export/export!)"))
        (finally
          (doseq [^File f (reverse (file-seq tmp-dir))]
            (.delete f)))))))

(comment
  ; Update the actual collection in `resources/instance_analytics`
  (export!))
