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

(defn- ->eol-url [db]
  (get {:postgres "https://endoflife.date/api/postgres.json"
        :mysql "https://endoflife.date/api/mysql.json"
        :mariadb "https://endoflife.date/api/mariadb.json"} db))

(defn- ->image-name [db] (str "mb-" (name db) "-db"))

(defn- ->deps-edn-alias [db version] (c/green ":db/" (name db) "-" (name version)))

(defn- fetch-supported-versions [database]
  (let [now (java.time.LocalDate/now)
        all-versions (-> (http/get (->eol-url database)) :body (json/parse-string true))
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

(defn- fetch-oldest-supported-version [database]
  (let [versions (fetch-supported-versions database)
        oldest-version (-> versions first :cycle)]
    (u/debug "OLDEST VERSION:" oldest-version)
    oldest-version))

(defn- resolve-version [database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version database)
    (cond-> version (keyword? version) name)))

;; Docker stuff:

(defn- kill-existing! [image-name]
  (println (c/red "killing existing image: ") image-name " ...")
  (shell/sh* {:quiet? true} "docker" "kill" image-name)
  (shell/sh* {:quiet? true} "docker" "rm" image-name))

(defmulti ^:private docker-cmd
  {:arglists '([db image-name resolved-version port])}
  (fn [db _image-name _resolved-version _port] db))

(defmethod docker-cmd :postgres
  [_db image-name resolved-version port]
  ["docker" "run"
   "-d"
   "-p" (str port ":5432")
   ;; "--network" "psql-metabase-network"
   "-e" "POSTGRES_USER=metabase"
   "-e" "POSTGRES_DB=metabase"
   "-e" "POSTGRES_PASSWORD=password"
   "-e" "PGDATA=/var/lib/postgresql/data"
   ;; "-v" "${DATA_DIR}:/var/lib/postgresql/data:Z"
   "--name" image-name
   (str "postgres:" resolved-version)])

(defmethod docker-cmd :mysql
  [_db image-name resolved-version port]
  ["docker" "run"
   "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" image-name
   (str "mysql:" resolved-version)])

(defmethod docker-cmd :mariadb
  [_db image-name resolved-version port]
  ["docker" "run"
   "-d"
   "-p" (str port ":3306")
   "-e" "MYSQL_DATABASE=metabase_test"
   "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"
   "--name" image-name
   (str "mariadb:" resolved-version)])

(defn- start-db!
  [database version resolved-version port]
  (let [image-name (->image-name database)
        _ (kill-existing! image-name)
        _ (println (c/green "docker runing:") image-name "...")
        cmd (docker-cmd database image-name resolved-version port)]
    (println "Running:" (c/magenta (str/join " " cmd)))
    (apply shell/sh cmd)
    (println (c/cyan (format "Started %s %s on port %s\n" (name database) (name version) port)))
    (println)
    (let [deps-edn-alias (->deps-edn-alias database version)]
      (printf "Use the %s alias in deps.edn to use this DB:\n" deps-edn-alias)
      (println (str "  clj -M:dev:ee:ee-dev" deps-edn-alias))
      (u/debug (str "  clj -M:dev:ee:ee-dev" deps-edn-alias " -e '(dev) (start!)'")))))

(defn- usage
  [{:keys [ports]}]
  (let [tbl (for [[db m] ports
                  [stamp port] m]
              {:port port
               :start-db-cmd (str "./bin/mage start-db " (name db) " " (name stamp))})]
    (str "\nAvailable DBs:\n"
         (with-out-str (t/table tbl {:sort [:start-db-cmd :port] :style :github-markdown}))
         (str/join "\n"
                   ["Note that we scrape https://endoflife.date/api to determine oldest supported versions,"
                    "So this script always have the correct oldest version. 🎉"]))))

;; TODOs:
;; - [ ] Swap out the db name

(defn start-db
  "Starts a db type + version in docker."
  [ports db version]
  (let [port (get-in ports [db version])
        _ (u/debug "PORT:" port)
        _ (when-not (integer? port)
            (println (c/red "No port found for db: " (name db)  " version: " (name version) ". see :ports in bb.edn"))
            (usage {:ports ports}))
        db               (keyword db)
        _ (when-not (#{:postgres :mysql :mariadb} db)
            (println (c/red "Invalid db."))
            (usage {:ports ports}))
        version          (cond-> version (string? version) keyword)
        resolved-version (resolve-version db version)]
    (start-db! db version resolved-version port)))
