(ns metabase.sidecar
  "Central namespace for sidecar mode. Consolidates sidecar initialization,
  shutdown, serdes import, user management, and database syncing."
  (:require
   [clojure.java.io :as io]
   [metabase.api-routes.sidecar :as sidecar-routes]
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.plugins.core :as plugins]
   [metabase.server.core :as server]
   [metabase.settings.core :as setting]
   [metabase.sidecar.middleware :as mw.sidecar]
   [metabase.sidecar.seed :as sidecar-seed]
   [metabase.sidecar.watcher :as sidecar-watcher]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defonce ^:private sidecar-watcher-state (atom nil))

(def ^:private import-lock (Object.))

(def ^:private sidecar-user-email "sidecar@metabase.local")

(defn- ensure-sidecar-user!
  "Ensure a superuser exists for sidecar mode. Creates one if needed.
  Sets the sidecar-user-id atom so the middleware can inject it into requests."
  []
  (let [existing-user (t2/select-one :model/User :is_superuser true
                                     {:where [:not= :id config/internal-mb-user-id]})]
    (if existing-user
      (do
        (log/infof "Using existing superuser %s (ID %d) for sidecar mode"
                   (:email existing-user) (:id existing-user))
        (reset! mw.sidecar/sidecar-user-id (:id existing-user)))
      (let [new-user (t2/insert-returning-instance!
                      :model/User
                      {:email      sidecar-user-email
                       :first_name "Sidecar"
                       :last_name  "User"
                       :password   (str (random-uuid)) ; random password, never used
                       :is_superuser true})]
        (log/infof "Created sidecar superuser %s (ID %d)" sidecar-user-email (:id new-user))
        (reset! mw.sidecar/sidecar-user-id (:id new-user))))))

(defn- ensure-sidecar-databases!
  "Sync Database records with the sidecar export directory. Creates stub records
  for new databases and removes records for databases no longer in the export."
  []
  (let [db-dir (io/file config/sidecar-dir "databases")]
    (when (.isDirectory db-dir)
      (let [export-db-names (into #{}
                                  (comp (filter #(.isDirectory ^java.io.File %))
                                        (map #(.getName ^java.io.File %)))
                                  (.listFiles db-dir))
            existing-dbs    (t2/select :model/Database)]
        ;; Create stubs for databases in the export that don't exist in the app DB
        (doseq [db-name export-db-names]
          (when-not (some #(= db-name (:name %)) existing-dbs)
            (log/infof "Creating stub database '%s' for sidecar mode" db-name)
            (t2/insert! :model/Database
                        {:name                db-name
                         :engine              :h2
                         :details             {}
                         :initial_sync_status "complete"})))
        ;; Remove databases no longer in the export directory
        (doseq [db existing-dbs]
          (when-not (contains? export-db-names (:name db))
            (log/infof "Removing stale database '%s' no longer in sidecar export" (:name db))
            (t2/delete! :model/Database :id (:id db))))))))

(defn- import-sidecar-serdes!
  "Import serdes data from the sidecar directory into the H2 app DB."
  []
  (locking import-lock
    (ensure-sidecar-databases!)
    (let [dir config/sidecar-dir]
      (log/infof "Importing serdes data from %s ..." dir)
      (let [v2-load-internal! (requiring-resolve
                               'metabase-enterprise.serialization.cmd/v2-load-internal!)
            result (v2-load-internal! dir
                                      {:backfill? true
                                       :continue-on-error true
                                       :reindex? false}
                                      :token-check? false
                                      :require-initialized-db? false)]
        (if (seq (:errors result))
          (log/warnf "Serdes import completed with %d errors" (count (:errors result)))
          (log/infof "Serdes import completed successfully (%d entities)" (count (:seen result))))))))

(defn- destroy-sidecar!
  "Shutdown function for sidecar mode."
  []
  (log/info "Metabase Sidecar Shutting Down ...")
  (when-let [state @sidecar-watcher-state]
    (sidecar-watcher/stop-watcher! state))
  (server/stop-web-server!)
  (let [timeout-seconds 20]
    (mdb/release-migration-locks! timeout-seconds))
  (log/info "Metabase Sidecar Shutdown COMPLETE"))

(defn init!
  "Minimal initialization for sidecar mode. Skips scheduler, sample data, Prometheus,
  audit DB, embedding settings, cloud migration, notification seeding, and other
  heavyweight startup steps."
  []
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println (str "\n"
                 "==============================================\n"
                 "  !! SIDECAR MODE !! \n"
                 "\n"
                 "  Data Dir: " config/sidecar-dir "\n"
                 "  Port:     " (config/config-int :mb-jetty-port) "\n"
                 "==============================================\n"))
  (log/infof "Starting Metabase Sidecar version %s ..." config/mb-version-string)
  (when (not= :h2 (config/config-kw :mb-db-type))
    (log/warn "Sidecar mode only supports H2. Ignoring MB_DB_TYPE and using H2."))
  (init-status/set-progress! 0.1)
  ;; Register shutdown hook
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy-sidecar!))
  (init-status/set-progress! 0.2)
  ;; Install classloader
  (classloader/the-classloader)
  ;; Load plugins (needed for DB drivers)
  (plugins/load-plugins!)
  (init-status/set-progress! 0.3)
  (setting/validate-settings-formatting!)
  ;; Setup & migrate H2 DB
  (log/info "Setting up sidecar H2 database...")
  (mdb/setup-db! :create-sample-content? false)
  (init-status/set-progress! 0.6)
  ;; Load seed data from CSV files
  (sidecar-seed/load-seed-data!)
  (init-status/set-progress! 0.7)
  ;; Create/find the sidecar superuser
  (ensure-sidecar-user!)
  (init-status/set-progress! 0.8)
  ;; Import serdes data from the sidecar directory
  (import-sidecar-serdes!)
  ;; Start watching for file changes and re-import on change
  (reset! sidecar-watcher-state
          (sidecar-watcher/start-watcher! config/sidecar-dir import-sidecar-serdes!))
  (init-status/set-progress! 0.9)
  (init-status/set-complete!)
  (log/info "Metabase Sidecar Initialization COMPLETE"))

(defn start!
  "Start Metabase in sidecar mode. Sets up routes, handler, web server, and
  runs sidecar initialization."
  []
  (try
    (let [server-routes (server/make-sidecar-routes #'sidecar-routes/routes)
          handler       (server/make-sidecar-handler server-routes)]
      (server/start-web-server! handler))
    (init!)
    (when (config/config-bool :mb-jetty-join)
      (.join (server/instance)))
    (catch Throwable e
      (log/error e "Metabase Sidecar Initialization FAILED")
      (System/exit 1))))
