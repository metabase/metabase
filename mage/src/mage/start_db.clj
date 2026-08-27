(ns mage.start-db
  (:require
   [babashka.http-client :as http]
   [cheshire.core :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;l
;; Normalize between db types:

(defn- ->container-name [db version] (str "mb-" (name db) "-" (name version)))

(defn- ->deps-edn-alias [db version] (c/green ":db/" (name db) "-" (name version)))

(defn all-versions [db-info] (-> db-info :eol-url http/get :body (json/parse-string true)))

(defmulti ^:private fetch-oldest-supported-version
  {:arglists '([database db-info])}
  (fn [database db-info] database))

(defn- fetch-oldest-supported-version* [db-info filter-fn sort-fn version-key]
  (->> (all-versions db-info)
       (map (fn [version] (update version :eol #(java.time.LocalDate/parse %))))
       (filter (fn [{:keys [^java.time.LocalDate eol]}] (.isAfter eol (java.time.LocalDate/now))))
       (filter filter-fn)
       (sort-by sort-fn)
       first
       version-key))

(defmethod fetch-oldest-supported-version :default
  [_database db-info]
  (fetch-oldest-supported-version*
   db-info
   (constantly true)
   (fn [{:keys [releaseDate]}] (java.time.LocalDate/parse releaseDate))
   :cycle))

(defmethod fetch-oldest-supported-version :oracle
  [_database db-info]
  (fetch-oldest-supported-version*
   db-info
   (fn [{:keys [cycle]}] (and cycle (> (Integer/parseInt cycle) 19)))
   (fn [{:keys [releaseDate]}] (java.time.LocalDate/parse releaseDate))
   :cycle))

(defmethod fetch-oldest-supported-version :sqlserver
  [_database db-info]
  (let [eol-version (fetch-oldest-supported-version*
                     db-info
                     (fn [{:keys [releaseLabel]}] (and releaseLabel (re-matches #"^\d{4} '__CODENAME__'$" releaseLabel)))
                     :releaseLabel
                     :releaseLabel)]
    (str/replace eol-version #" '__CODENAME__'" "-latest")))

(defmethod fetch-oldest-supported-version :clickhouse
  [_database _db-info]
  "23.3")

(defmulti ^:private fetch-latest-supported-version
  {:arglists '([database db-info])}
  (fn [database db-info] database))

(defmethod fetch-latest-supported-version :default
  [_database _db-info]
  "latest")

(defmethod fetch-latest-supported-version :sqlserver
  [_database _db-info]
  "2025-latest")

(defn- resolve-version [db-info database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version database db-info)
    (fetch-latest-supported-version database db-info)))

;; Docker stuff:

(defn- kill-existing! [container-name]
  (println (c/red "killing existing container: ") container-name " ...")
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defmulti ^:private docker-cmd
  {:arglists '([db container-name resolved-version port])}
  (fn [db _container-name _resolved-version _port] db))

(defmethod docker-cmd :postgres
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-p" (str port ":5432")
   ;; "--network" "psql-metabase-network"
   "-e" "POSTGRES_USER=metabase"
   "-e" "POSTGRES_DB=metabase"
   "-e" "POSTGRES_PASSWORD=password"
   "-e" "PGDATA=/var/lib/postgresql/data"
   ;; "-v" "${DATA_DIR}:/var/lib/postgresql/data:Z"
   "--name" container-name
   (str "postgres:" resolved-version)])

(defmethod docker-cmd :mysql
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" container-name
   (str "mysql:" resolved-version)])

(defmethod docker-cmd :mariadb
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" container-name
   (str "mariadb:" resolved-version)])

(defmethod docker-cmd :mongo
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-e" "MONGO_INITDB_ROOT_USERNAME=metabase"
   "-e" "MONGO_INITDB_ROOT_PASSWORD=metasample123"
   "-p" (str port ":27017")
   "--name" container-name
   (str "mongo:" resolved-version)])

(defmethod docker-cmd :clickhouse
  [_db container-name resolved-version port]
  ["docker" "compose"
   "-f" "modules/drivers/clickhouse/docker-compose.yml"
   "up" "-d"
   (if (= resolved-version "latest")
     "clickhouse"
     "clickhouse_older_version")]) ;; these are defined in modules/drivers/clickhouse/docker-compose.yml

(defmethod docker-cmd :sqlserver
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-p" (str port ":1433")
   "-e" "ACCEPT_EULA=Y"
   "-e" "SA_PASSWORD=P@ssw0rd"
   "--name" container-name
   (str "mcr.microsoft.com/mssql/server:" resolved-version)])

(defmethod docker-cmd :oracle
  [_db container-name resolved-version port]
  ["docker" "run" "-d"
   "-p" (str port ":1521")
   "-e" "ORACLE_PASSWORD=password"
   "--name" container-name
   (if (= resolved-version "latest")
     "gvenzl/oracle-free:latest"
     (str "gvenzl/oracle-xe:" resolved-version))])

(defn- app-db? [db]
  (contains? #{:postgres :mysql :mariadb} db))

(defn- start-db!
  [database version resolved-version port]
  (let [container-name (->container-name database version)
        _ (kill-existing! container-name)
        _ (println (c/green "docker runing:") container-name "...")
        cmd (docker-cmd database container-name resolved-version port)]
    (println "Running:" (c/magenta (str/join " " cmd)))
    (apply shell/sh cmd)
    (println (c/cyan (format "Started %s %s on port %s\n" (name database) (name version) port)))
    (println)
    (when (app-db? database)
      (let [deps-edn-alias (->deps-edn-alias database version)]
        (printf "Use the %s alias in deps.edn to use this DB:\n" deps-edn-alias)
        (println (str "  clj -M:dev:ee:ee-dev" deps-edn-alias))
        (u/debug (str "  clj -M:dev:ee:ee-dev" deps-edn-alias " -e '(dev) (start!)'"))))))

(defn- usage
  [{:keys [db-info]}]
  (let [tbl (for [[db info] db-info
                  [stamp port] (:ports info)]
              {:start-db-cmd (str "./bin/mage start-db " (name db) " " (name stamp))
               :port port})]
    (str "\nAvailable DBs:\n"
         (with-out-str (t/table tbl {:style :github-markdown}))
         (str/join "\n"
                   ["Note that we scrape https://endoflife.date/api to determine oldest supported versions,"
                    "So this script always has the correct oldest version. 🎉"]))))

;; TODOs:
;; - [ ] Swap out the db name

(defn start-db
  "Starts a db type + version in docker."
  ([db-info db version]
   (start-db db-info db version nil))
  ([db-info db version opts]
   (when (and (= db :clickhouse) (:port opts))
     (throw (ex-info (c/red "--port is not supported for clickhouse. Ports are configured in modules/drivers/clickhouse/docker-compose.yml") {:babashka/exit 1})))
   (let [default-port     (get-in db-info [:ports version])
         port             (or (:port opts) default-port)
         resolved-version (resolve-version db-info db version)]
     (start-db! db version resolved-version port))))
