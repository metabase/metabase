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

(defn- fetch-supported-versions [db-info database]
  (let [now (java.time.LocalDate/now)
        all-versions (-> (http/get (get-in db-info [database :eol-url])) :body (json/parse-string true))
        _ (u/debug "all-versions: \n" (with-out-str (t/table all-versions)))
        supported (->> all-versions
                       (mapv (fn [m]
                               (-> m
                                   (update :releaseDate #(and % (-> % java.time.LocalDate/parse)))
                                   (update :eol #(and % (-> % java.time.LocalDate/parse))))))
                       (filter (fn [{:keys [^java.time.LocalDate eol]}]
                                 (and eol (.isAfter eol now))))
                       (sort-by :releaseDate)
                       vec)]
    (u/debug "supported: \n" (with-out-str (t/table supported)))
    supported))

(defn- fetch-oldest-supported-version [db-info database]
  (let [versions (fetch-supported-versions db-info database)
        oldest-version (-> versions first :cycle)]
    (u/debug "OLDEST VERSION:" oldest-version)
    oldest-version))

(defn- resolve-version [db-info database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version db-info database)
    (cond-> version (keyword? version) name)))

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
