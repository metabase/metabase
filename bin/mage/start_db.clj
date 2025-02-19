(ns start-db
  (:require
   [babashka.http-client :as http]
   [cheshire.core :as json]
   [shell]))

(set! *warn-on-reflection* true)

(def ^:private ports
  {:mariadb  {:oldest 3306
              :latest 3307}
   :mysql    {:oldest 3308
              :latest 3309}
   :postgres {:oldest 5432
              :latest 5433}})

(def ^:private eol-urls
  {:postgres "https://endoflife.date/api/postgresql.json"})

(defn- fetch-supported-versions [database]
  (as-> (http/get (get eol-urls database)) <>
    (:body <>)
    (json/parse-string <> true)
    (map (fn [m]
           (reduce
            (fn [m k]
              (update m k (fn [^String s]
                            (some-> s java.time.LocalDate/parse))))
            m
            [:releaseDate :eol :latestReleaseDate]))
         <>)
    (filter (fn [{:keys [^java.time.LocalDate eol]}]
              (.isAfter eol (java.time.LocalDate/now)))
            <>)
    (sort-by :releaseDate <>)))

(defn- fetch-oldest-supported-version [database]
  (-> (fetch-supported-versions database)
      first
      :cycle
      parse-long))

(defmulti ^:private resolve-version
  {:arglists '([database version])}
  (fn [database version]
    [(keyword database) version]))

(defmethod resolve-version :default
  [database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version database)
    version))

(defn- kill-existing! [image-name]
  (shell/sh* {:quiet? true} "docker" "kill" image-name)
  (shell/sh* {:quiet? true} "docker" "rm" image-name))

(defmulti ^:private start-db!
  {:arglists '([database version resolved-version port])}
  (fn [database _version _resolved-version _port]
    (keyword database)))

(defmethod start-db! :postgres
  [_database version resolved-version port]
  (let [image-name "mb-postgres-db"]
    (kill-existing! image-name)
    (shell/sh "docker" "run"
              "-d"
              "-p" (str port ":5432")
              ;; "--network" "psql-metabase-network"
              "-e" "POSTGRES_USER=metabase"
              "-e" "POSTGRES_DB=metabase"
              "-e" "POSTGRES_PASSWORD=password"
              "-e" "PGDATA=/var/lib/postgresql/data"
              ;; "-v" "${DATA_DIR}:/var/lib/postgresql/data:Z"
              "--name" image-name
              (str "postgres:" resolved-version))
    (printf "Started Postgres %s on port %s\n" version port)
    (println)
    (when-let [deps-edn-alias (condp = version
                                :oldest :db/postgres-oldest
                                :latest :db/postgres-latest)]
      (printf "Use the %s alias in deps.edn to use this DB.\n"
              deps-edn-alias))))

(defn usage []
  (println "Usage:")
  (println)
  (println "  ./bin/mage.sh start-db <db> <version>")
  (println)
  (println "Available DBs:")
  (println)
  (doseq [[db versions] (sort-by first ports)]
    (println (name db))
    (doseq [version (keys versions)]
      (println "  " (name version)))))

(defn- start-db* [db version]
  (let [db               (keyword db)
        version          (cond-> version
                           (string? version) keyword)
        port             (get-in ports [db version])
        resolved-version (resolve-version db version)]
    (assert (integer? port)
            (format "Invalid port: %s" (pr-str port)))
    (start-db! db version resolved-version port)))

(defn start-db [{:keys [args]}]
  (if-not (= (count args) 2)
    (usage)
    (start-db* (first args) (second args))))
