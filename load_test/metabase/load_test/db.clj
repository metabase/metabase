(ns metabase.load-test.db
  "Setups a connection to an initialized db that can be used to create test fixtures"
  (:require
   [dev.add-load :as add-load]
   [integrant.core :as ig]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.load-test.containers :as lt.containers]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.initialize.db :as initialize.db]
   [metabase.test.initialize.test-users :as initialize.test-users]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn- container->broken-out-details
  [db-config container-info]
  (prn db-config)
  (prn container-info)
  (assoc db-config
         :host "localhost"
         :port (get (:mapped-ports container-info) (Integer/parseInt (:port db-config)))))

(defn- container->ApplicationDB
  [{:keys [db-config container-info] :as db}]
  (prn db)
  (prn db-config container-info)
  (mdb.connection/application-db
   (:db-type db-config)
   (mdb.data-source/broken-out-details->DataSource
    (:db-type db-config)
    (container->broken-out-details db-config container-info))))

;; (defn do-with-app-db-connection-from-system
;;   [system-key thunk]
;;   (if-let [db-container (get lt.containers/*container-system* system-key)]
;;     (binding [mdb.connection/*application-db* (container->ApplicationDB db-container)]
;;       (thunk))
;;     (throw (ex-info "Can't find db container" {:system lt.containers/*container-system*}))))

;; (defmacro with-container-app-db
;;   [system-key & body]
;;   `(do-with-app-db-connection-from-system ~system-key (fn [] ~@body)))

(defn set-test-db-env!
  [db-type {:keys [host port user password]}]
  (let [db-type-env (case db-type
                      :postgres :postgresql)]
    (mt/db-test-env-var! db-type-env :host host)
    (mt/db-test-env-var! db-type-env :port port)
    (mt/db-test-env-var! db-type-env :user user)
    (mt/db-test-env-var! db-type-env :password password)))

;; (defn do-with-db-from-system!
;;   [system-key dbdef thunk]
;;   (if-let [db-container (get lt.containers/*container-system* system-key)]
;;     (let [{:keys [db-config container-info]} db-container
;;           db-model (t2/insert-returning-instance! :model/Database {:name "test-db"
;;                                                                    :engine (:db-type db-config)
;;                                                                    :settings {:database-source-dataset-name "test-data"}
;;                                                                    :details (assoc (container->broken-out-details db-config container-info)
;;                                                                                    :dbname "test-data")})]
;;       (mt/with-driver (:db-type db-config)
;;         (set-test-db-env! (:db-type db-config)
;;                           (container->broken-out-details db-config container-info))
;;         (load-data/create-db! (:db-type db-config) (mt/get-dataset-definition dbdef))
;;         (set-test-db-env! (:db-type db-config) {:host nil :port nil :user nil :password nil})
;;         (sync/sync-database! db-model)
;;         (t2/update! :model/Database :id (:id db-model) {:details (assoc db-config :dbname "test-data")})
;;         (mt/with-db db-model
;;           (thunk))))
;;     (throw (ex-info "Can't find db container" {:system lt.containers/*container-system*}))))

;; (defmacro with-db-and-dataset!
;;   {:style/indent :defn}
;;   [system-key dataset & body]
;;   `(do-with-db-from-system! ~system-key (data.impl/resolve-dataset-definition '~(ns-name *ns*) '~dataset) (fn []  ~@body)))

(defmethod ig/init-key :db/app-db [_ opts]
  (let [db (ig/init-key :db/postgres opts)]
    (prn "DB" (type db))
    (prn "DB" db)
    (try
      (if (not= (:status db) :success)
        {:status :failed}
        (binding [mdb.connection/*application-db* (container->ApplicationDB db)]
          (initialize.db/init!)
          (initialize.test-users/init!)
          (assoc db :status :success)))
      (catch Throwable err
        (log/error err)
        (assoc db {:status :failed})))))

(defmethod ig/init-key :seed/app-db [_ {:keys [app-db data-load dwh-db]}]
  (try
    (if (and (not= (:status app-db) :success)
             (not= (:status dwh-db) :success))
      {:status :failed}
      (binding [mdb.connection/*application-db* (container->ApplicationDB app-db)]
        (if dwh-db
          (mt/with-db (:db-model dwh-db)
            (assoc app-db :loaded-data (add-load/from-script data-load)))
          (assoc app-db :loaded-data (add-load/from-script data-load)))))
    (catch Throwable err
      (log/error err)
      {:status :failed})))

(defmethod ig/init-key :seed/dwh-db [_ {:keys [app-db dwh-db dbdef]}]
  (try
    (binding [mdb.connection/*application-db* (container->ApplicationDB app-db)]
      (let [{:keys [db-config container-info]} dwh-db]
        (mt/with-driver (:db-type db-config)
          (set-test-db-env! (:db-type db-config)
                            (container->broken-out-details db-config container-info))
          (let [db-model (data.impl/get-or-create-database! (:db-type db-config) dbdef)]
            (set-test-db-env! (:db-type db-config) {:host nil :port nil :user nil :password nil})
            (t2/update! :model/Database :id (:id db-model) {:details db-config})
            (assoc dwh-db :db-id (:id db-model))))))
    (catch Throwable err
      (log/error err)
      {:status :failed})))
