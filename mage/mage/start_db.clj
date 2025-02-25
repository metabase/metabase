(ns mage.start-db
  (:require
   #_:clj-kondo/ignore
   #_:clj-kondo/ignore
   [babashka.http-client :as http]
   [cheshire.core :as json]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

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
    (sort-by :releaseDate <>)
    vec))

(defn- fetch-oldest-supported-version [database]
  (let [versions (fetch-supported-versions database)]
    (u/debug "Found Versions:" (pr-str versions))
    (-> versions first :cycle parse-long)))

(defmulti ^:private resolve-version
  {:arglists '([database version])}
  (fn [database version]
    [(keyword database) version]))

(defmethod resolve-version :default
  [database version]
  (if (= version :oldest)
    (fetch-oldest-supported-version database)
    (cond-> version (keyword? version) name)))

(defn- kill-existing! [image-name]
  (println (c/red "killing existing image: "
                  (c/escape image-name)
                  " ..."))
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
    (println (c/green "docker runing: " (c/escape image-name) " ..."))
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
    (println (c/cyan (format "Started Postgres %s on port %s\n" version port)))
    (println)
    (when-let [deps-edn-alias (c/bold (c/green
                                       (str (condp = version
                                              ;; todo add the rest of these
                                              :oldest :db/postgres-oldest
                                              :latest :db/postgres-latest))))]
      (printf "Use the %s alias in deps.edn to use this DB:\n" deps-edn-alias)
      (println (str "  clj -M:dev:ee:ee-dev" deps-edn-alias)))))

(defn- usage
  [ports]
  (println "Usage:")
  (println)
  (println "  bb start-db <db> <version>")
  (println)
  (println "Available DBs:")
  (println)
  (t/table
   (for [[db m] ports
         [stamp port] m]
     {:port port
      :start-db-cmd (str "./bin/mage start-db " (name db) " " (name stamp))})
   {:sort [:start-db-cmd :port]
    :style :github-markdown}))

(defn- start-db* [ports db version]
  (let [db               (keyword db)
        version          (cond-> version (string? version) keyword)
        port             (get-in ports [db version])
        resolved-version (resolve-version db version)]
    (assert (integer? port)
            (format "Invalid port: %s" (pr-str port)))
    (start-db! db version resolved-version port)))

;; TODOs:
;; Can i swap out the db name?
;; - [ ] Does it get wiped when I stop docker?

(defn start-db
  "Starts a db: type + version"
  [{:keys [ports]} cli-args]
  (if-not (= (count cli-args) 2)
    (usage ports)
    (start-db* ports (first cli-args) (second cli-args))))
