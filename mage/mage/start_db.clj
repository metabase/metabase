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

(defmulti ^:private fetch-oldest-supported-version
  {:arglists '([database db-info])}
  (fn [database db-info] database))

(defmethod fetch-oldest-supported-version :default
  [database db-info]
  (let [now (java.time.LocalDate/now)
        all-versions (-> (http/get (get-in db-info [database :eol-url])) :body (json/parse-string true))
        oldest-version (->> all-versions
                            (mapv (fn [m]
                                    (-> m
                                        (update :releaseDate #(and % (-> % java.time.LocalDate/parse)))
                                        (update :eol #(and % (-> % java.time.LocalDate/parse))))))
                            (filter (fn [{:keys [^java.time.LocalDate eol]}]
                                      (and eol (.isAfter eol now))))
                            (sort-by :releaseDate)
                            vec
                            first
                            :cycle)]
    (u/debug "all-versions: \n" (with-out-str (t/table all-versions)))
    oldest-version))

(defmethod fetch-oldest-supported-version :oracle
  [database db-info]
  (let [now (java.time.LocalDate/now)
        all-versions (-> (http/get (get-in db-info [database :eol-url])) :body (json/parse-string true))
        oldest-version (->> all-versions
                            (mapv (fn [m]
                                    (-> m
                                        (update :releaseDate #(and % (-> % java.time.LocalDate/parse)))
                                        (update :eol #(and % (-> % java.time.LocalDate/parse))))))
                            (filter (fn [{:keys [^java.time.LocalDate eol cycle]}]
                                      (and eol (.isAfter eol now)
                                           cycle (> (Integer/parseInt cycle) 19))))
                            (sort-by :releaseDate)
                            vec
                            first
                            :cycle)]
    oldest-version))

(defmethod fetch-oldest-supported-version :sqlserver
  [database db-info]
  (let [now (java.time.LocalDate/now)
        all-versions (-> (http/get (get-in db-info [database :eol-url])) :body (json/parse-string true))
        oldest-version (->> all-versions
                            (mapv (fn [m]
                                    (-> m
                                        (update :releaseDate #(and % (-> % java.time.LocalDate/parse)))
                                        (update :eol #(and % (-> % java.time.LocalDate/parse))))))
                            (filter (fn [{:keys [^java.time.LocalDate eol]}]
                                      (and eol (.isAfter eol now))))
                            (filter (fn [{:keys [releaseLabel]}]
                                      (and releaseLabel (re-matches #"^\d{4}$" releaseLabel))))
                            (sort-by :releaseLabel)
                            vec
                            first
                            :releaseLabel)]
    (str oldest-version "-latest")))

(defmethod fetch-oldest-supported-version :clickhouse
  [database db-info]
  23.3)

(defn- resolve-version [db-info database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version database db-info)
    "latest"))

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
  ["docker" "run"
   "-d"
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
  ["docker" "run"
   "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" container-name
   (str "mysql:" resolved-version)])

(defmethod docker-cmd :mariadb
  [_db container-name resolved-version port]
  ["docker" "run"
   "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" container-name
   (str "mariadb:" resolved-version)])

(defmethod docker-cmd :mongo
  [_db container-name resolved-version port]
  ["docker" "run"
   "-d"
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
  ["docker" "run"
   "-d"
   "-p" (str port ":1433")
   "-e" "ACCEPT_EULA=Y"
   "-e" "SA_PASSWORD=P@ssw0rd"
   "--name" container-name
   (str "mcr.microsoft.com/mssql/server:" resolved-version)])

(defmethod docker-cmd :oracle
  [_db container-name resolved-version port]
  ["docker" "run"
   "-d"
   "-p" (str port ":1521")
   "-e" "ORACLE_PASSWORD=password"
   "--name" container-name
   (if (= resolved-version "latest")
     "gvenzl/oracle-free:latest"
     (str "gvenzl/oracle-xe:" resolved-version))])

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
    (let [deps-edn-alias (->deps-edn-alias database version)]
      (printf "Use the %s alias in deps.edn to use this DB:\n" deps-edn-alias)
      (println (str "  clj -M:dev:ee:ee-dev" deps-edn-alias))
      (u/debug (str "  clj -M:dev:ee:ee-dev" deps-edn-alias " -e '(dev) (start!)'")))))

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
  [db-info db version]
  (let [port             (get-in db-info [db :ports version])
        db               (keyword db)
        version          (cond-> version (string? version) keyword)
        resolved-version (resolve-version db-info db version)]
    (u/debug "PORT:" port)
    (cond (not (contains? db-info db))
          (do
            (println (c/red "Invalid DB: " (name db)))
            (println (usage {:db-info db-info})))

          (not (integer? port))
          (do
            (println (c/red "No port found for DB: " (name db)  ", version: " (name version) ". See :db-info in bb.edn"))
            (println (usage {:db-info db-info})))

          :else
          (start-db! db version resolved-version port))))
