(ns metabase.load-test.db
  "Setups a connection to an initialized db that can be used to create test fixtures"
  (:require
   [dev.add-load :as add-load]
   [integrant.core :as ig]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.interface :as data.interface]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.initialize.db :as initialize.db]
   [metabase.test.initialize.test-users :as initialize.test-users]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- container->broken-out-details
  [db-config container-info]
  (assoc db-config
         :host "localhost"
         :port (get (:mapped-ports container-info) (Integer/parseInt (:port db-config)))))

(defn container->ApplicationDB
  [{:keys [db-config container-info] :as db}]
  (mdb.connection/application-db
   (:db-type db-config)
   (mdb.data-source/broken-out-details->DataSource
    (:db-type db-config)
    (container->broken-out-details db-config container-info))))

(defn set-test-db-env!
  [db-type {:keys [host port user password]}]
  (let [db-type-env (case db-type
                      :postgres :postgresql)]
    (mt/db-test-env-var! db-type-env :host host)
    (mt/db-test-env-var! db-type-env :port port)
    (mt/db-test-env-var! db-type-env :user user)
    (mt/db-test-env-var! db-type-env :password password)))

(defmethod ig/init-key :db/app-db [_ opts]
  (let [db (ig/init-key :db/postgres opts)]
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
        (if-let [{:keys [db-model db-config]} dwh-db]
          (mt/with-driver (:db-type db-config)
            (mt/with-db db-model
              (assoc app-db :loaded-data (add-load/from-script (data-load)))))
          (assoc app-db :loaded-data (add-load/from-script (data-load))))))
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
          (let [dbdef* (data.impl/resolve-dataset-definition (ns-name *ns*) dbdef)
                {:keys [database-name] :as dbdef**} (data.interface/get-dataset-definition dbdef*)
                db-model (data.impl/get-or-create-database! (:db-type db-config) dbdef*)]
            (set-test-db-env! (:db-type db-config) {:host nil :port nil :user nil :password nil})
            (t2/update! :model/Database :id (:id db-model) {:details (assoc db-config :dbname database-name)})
            (assoc dwh-db :db-model (t2/select-one :model/Database :id (:id db-model)))))))
    (catch Throwable err
      (log/error err)
      {:status :failed})))
