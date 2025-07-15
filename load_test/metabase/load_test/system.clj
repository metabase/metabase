(ns metabase.load-test.system
  "Utilities for managing the integrant system that managed load test resources"
  (:require
   [integrant.core :as ig]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.load-test.containers]
   [metabase.load-test.db :as lt.db]))

(def ^:dynamic *system* nil)

(defn started?
  "True when all system components have successfully started. Requires all components to return a field called :status."
  []
  (every? #(= % :success) (map (comp :status val) *system*)))

(derive :db/postgres :infra/container)
(derive :db/app-db :db/postgres)
(derive :db/dwh-db :db/postgres)

(derive :web/metabase :infra/container)
(derive :web/nginx :infra/container)

(def base-system
  {:infra/network {:name "test.metabase.dev"}
   :db/app-db     {:network (ig/ref :infra/network)}
   :web/nginx     {:network (ig/ref :infra/network)}})

(defn with-app-db-seed
  ([system forms]
   (with-app-db-seed system nil forms))
  ([system dwh-db-key forms]
   (assoc system :seed/app-db (cond-> {:app-db    (ig/ref :db/app-db)
                                       :data-load forms}
                                dwh-db-key (assoc :dwh-db (ig/ref dwh-db-key))))))

(defn with-dwh-db-seed
  ([system dbdef]
   (-> (assoc system :db/dwh-db {:network  (ig/ref :infra/network)
                                 :hostname "dwh-postgres"})
       (with-dwh-db-seed :db/dwh-db :seed/dwh-db dbdef)))
  ([system dwh-db-key seed-key dbdef]
   (assoc system seed-key {:app-db (ig/ref :db/app-db)
                           :dwh-db (ig/ref dwh-db-key)
                           :dbdef  dbdef})))

(defn with-metabase-cluster
  ([system instance-count]
   (with-metabase-cluster system instance-count :db/app-db [] {}))
  ([system instance-count app-db-seeded-key]
   (with-metabase-cluster system instance-count app-db-seeded-key [] {}))
  ([system instance-count app-db-seeded-key dwh-db-keys]
   (with-metabase-cluster system instance-count app-db-seeded-key dwh-db-keys {}))
  ([system instance-count app-db-seeded-key dwh-db-keys options]
   (assoc system :web/metabase (merge {:instance-count instance-count
                                       :app-db         (ig/ref app-db-seeded-key)
                                       :dwh-dbs        (map ig/ref dwh-db-keys)
                                       :token          (config/config-str :mb-premium-embedding-token)
                                       :virtual-host   "test.metabase.dev"
                                       :network        (ig/ref :infra/network)}
                                      options))))

(defn stop!
  [system]
  (ig/halt! system))

(defn start!
  [system]
  (ig/init system))

(defn do-with-system!
  [system thunk]
  (binding [*system* (start! system)]
    (try
      (when-not (started?)
        (throw (ex-info "System failed to start" {:failed (remove #(= (:status (val %)) :success) *system*)})))
      (binding [mdb.connection/*application-db* (lt.db/container->ApplicationDB (:db/app-db *system*))]
        (thunk *system*))
      (finally
        (stop! *system*)))))

(defmacro with-system!
  {:clj-kondo/lint-as :defn}
  [[bindings system] & body]
  `(do-with-system! ~system (fn [~bindings] ~@body)))
