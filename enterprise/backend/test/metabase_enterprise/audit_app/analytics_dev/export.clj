(ns metabase-enterprise.audit-app.analytics-dev.export
  "One-eval REPL / test entry point that produces the instance-analytics
  canonical YAML export. Spins up an embedded Postgres, runs app-db migrations
  against it, seeds a superuser, runs the analytics-dev import pipeline, then
  re-exports the resulting collection back to the target directory.

  DWH sync and QP execution are deliberately suppressed during the run so the
  export output is purely driven by serdes round-tripping — no accidental diffs
  from synced schemas or re-computed result metadata."
  (:require
   [metabase-enterprise.audit-app.analytics-dev :as analytics-dev]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.query-processor.core :as qp]
   [metabase.sync.core :as sync]
   [metabase.test.embedded-postgres.core :as emb-pg]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
  [port]
  (mdb/application-db
   :postgres
   (mdb/broken-out-details->DataSource :postgres {:host "localhost"
                                                  :port port
                                                  :db   "postgres"
                                                  :user "postgres"})
   :create-pool? true))

(defn- seed-superuser! []
  (or (t2/select-one :model/User :email (:email seed-user))
      (t2/insert-returning-instance! :model/User seed-user)))

(defn- run-export! [target-dir]
  (audit/analytics-dev-mode! true)
  (let [user (seed-superuser!)]
    (with-redefs [sync/sync-database! (fn [& _args]
                                        (throw (ex-info "Sync invocation during analytics-dev export"
                                                        {:type ::sync-invocation})))
                  qp/process-query    (fn [& _args]
                                        (throw (ex-info "QP invocation during analytics-dev export"
                                                        {:type ::qp-invocation})))]
      (analytics-dev/create-analytics-dev-database! (:id user) {:sync? false})
      (analytics-dev/import-analytics-content! (:email user))
      (let [collection (analytics-dev/find-analytics-collection)]
        (when-not collection
          (throw (ex-info "analytics collection not found after import" {})))
        (analytics-dev/export-analytics-content! (:id collection) (:email user) target-dir)))))

(defn export!
  "Run the full analytics-dev export pipeline against a fresh embedded Postgres.
  Writes canonical YAMLs into `target-dir` (defaults to the checked-in
  `resources/instance_analytics` tree)."
  ([]
   (export! default-target-dir))
  ([target-dir]
   (log/info "Analytics-dev export starting; target-dir=" target-dir)
   (emb-pg/with-system [system {::emb-pg/db-server {}}]
     (let [{::emb-pg/keys [port]} (::emb-pg/db-server system)]
       (mdb/with-application-db (fresh-app-db port)
         (mdb/setup-db! :create-sample-content? false)
         (run-export! target-dir))))))
