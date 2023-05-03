(ns metabase-enterprise.audit-db
  "This is here so we can try to require it and see whether or not EE code is on the classpath."
  (:require [clojure.java.shell :as sh]
            [clojure.pprint :as pp]
            [clojure.string :as str]
            [metabase.db.env :as mdb.env]
            [metabase.models.database :refer [Database]]
            [metabase.sync.schedules :as sync.schedules]
            [metabase.util :as u]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(defn- install-database!
  "Creates the audit db, a clone of the app db used for auditing purposes."
  [{:keys [engine details]}]
  (first (t2/insert-returning-instances!
          Database
          (merge {:is_audit     true
                  :name         "Audit Database"
                  :description  "Internal Audit DB used to power metabase analytics."
                  :engine       engine
                  :details      details
                  :is_full_sync true
                  :is_on_demand false
                  :creator_id   nil
                  :auto_run_queries true}
                 (sync.schedules/schedule-map->cron-strings
                  (sync.schedules/default-randomized-schedule))))))

(defn- add-file-uri-prefix [db-file]
  (str "file:/" (str/trim (:out (sh/sh "pwd"))) "/"  db-file))

(defn mb-db-info->db [mb-db-env-info]
  (case (:mb-db-type mb-db-env-info)
    :h2 {:engine :h2
         :details {:db (add-file-uri-prefix (:mb-db-file mb-db-env-info))
                   :advanced-options false}}
    :postgres {:engine :postgres
               :details {:todo "?"}}
    :mysql {:engine :mysql
            :details {:todo "?"}}))

(defn ensure-db-installed!
  "Called on app startup to ensure the existance of the audit db in enterprise apps."
  []
  (let [audit-db (t2/select-one Database :is_audit true)
        app-db-info (mb-db-info->db mdb.env/env)]
    (cond
      (nil? audit-db)
      (u/prog1 :metabase-enterprise.audit-db/installed
        (log/info "Audit DB does not exist, Installing...")
        (install-database! app-db-info))

      (not= app-db-info (select-keys audit-db [:details :engine]))
      (u/prog1 :metabase-enterprise.audit-db/replaced
        (log/info "Audit DB does not match app-db, did something change???")
        (log/info (with-out-str
                    #_{:clj-kondo/ignore [:discouraged-var]}
                    (pp/pprint [["env:          " mdb.env/env]
                                ["App DB INFO:  " app-db-info]
                                ["Old Audit DB: " audit-db]])))
        (log/info "Deleting Old Audit DB...")
        (t2/delete! Database :is_audit true)
        (log/info "Installing Audit DB...")
        (install-database! app-db-info))

      :else
      :metabase-enterprise.audit-db/no-op)))

(comment
  (ensure-db-installed!)
  )

#_(mu/defn ensure-db-exists!
  "Called on app startup to ensure the existance of the audit db in enterprise apps.

  Returns a keyword indicating what action was taken."
  []
  (let [audit-db (t2/select-one Database :is_audit true)]
    (log/info "Resetting Audit DB...")
    (when audit-db
      (t2/delete! Database :is_audit true))
    mdb.connection/*application-db*))

#_(let [{:keys [mb-db-pass
              mb-db-port
              mb-db-file
              mb-db-user
              mb-db-dbname
              mb-db-type
              mb-db-host
              mb-db-connection-uri
              mb-db-in-memory]} mdb.env/env]
  (case mb-db-type
    :h2 {:db mb-db-file}
    :postgres {:user mb-db-user}
    :mysql {}))


(comment ;; H2:

;; input to api/database's: defn- insert-database! [name engine details-or-error is-full-sync? is_on_demand cache_ttl details schedules auto_run_queries]
  {:details {:db "file://Users/bcm/dv/mb/metabase/metabase.db", :advanced-options false},
   :engine "h2"
   ;; :auto_run_queries true,
   ;; :name "son of app-db",
   ;; :is-full-sync? false,
   ;; :cache_ttl nil,
   ;; :is_on_demand false,
   ;; :schedules {},
   }

  mdb.env/env
  {:mb-db-file "metabase.db"
   :mb-db-type :h2
   :mb-db-pass nil
   :mb-db-port nil
   :mb-db-user nil
   :mb-db-dbname nil
   :mb-db-host nil
   :mb-db-connection-uri nil
   :mb-db-in-memory nil}


  (mb-db-info->db mdb.env/env)
  )

(comment ;; Postgres:

mdb.env/env
;; =>


;; added through api looks like:
{:auto_run_queries true,
 :name "postgres app db",
 :is-full-sync? false,
 :cache_ttl nil,

 :details {:ssl false,
           :password nil,
           :port 5432,
           :advanced-options false,
           :schema-filters-type "all",
           :dbname "son_of_metabase",
           :host "localhost",
           :tunnel-enabled false,
           :user "bcm"}
 ,
 :is_on_demand false,
 :schedules {},
 :engine "postgres"})

(comment ;; Mysql:

mdb.env/env
{:mb-db-pass nil
 :mb-db-port 3308
 :mb-db-file "metabase.db"
 :mb-db-user "root"
 :mb-db-dbname "metabase_test"
 :mb-db-type :mysql
 :mb-db-host "localhost"
 :mb-db-connection-uri nil
 :mb-db-in-memory nil}

;; added through api looks like:
{:auto_run_queries true
 :name "test mysq"
 :is-full-sync? false
 :cache_ttl nil

 :details {:host "localhost"
           :port 3308
           :dbname "metabase_test"
           :user "root"
           :password nil
           :ssl false
           :tunnel-enabled false
           :advanced-options false}

 :is_on_demand false
 :schedules {}
 :engine "mysql"}

  )
