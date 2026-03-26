(ns mage.edpaget.dev-env
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port bases

(def ^:private port-bases
  {:jetty           3000
   :frontend-dev    8080
   :nrepl           50605
   :socket-repl     50505
   :postgres-app    15432
   :postgres-wh     25432
   :mysql           13309
   :mariadb         13306
   :mongo           37017
   :clickhouse-http 18123
   :clickhouse-nat  19000
   :ldap            11389
   :maildev-smtp    11025
   :maildev-ui      11080})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Service specs

(def ^:private service-specs
  "Map of service-key -> spec. :internal-ports is a vector of [host-key internal-port] pairs."
  {:postgres   {:image          "postgres:17"
                :internal-ports [[:postgres-app 5432]]
                :wh-ports       [[:postgres-wh 5432]]
                :env            {"POSTGRES_USER"     "metabase"
                                 "POSTGRES_DB"       "metabase"
                                 "POSTGRES_PASSWORD" "password"
                                 "PGDATA"            "/var/lib/postgresql/data"}
                :can-be-app-db? true}
   :mysql      {:image          "mysql:8.4"
                :internal-ports [[:mysql 3306]]
                :env            {"MYSQL_DATABASE"             "metabase_test"
                                 "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}
                :can-be-app-db? true}
   :mariadb    {:image          "mariadb:11"
                :internal-ports [[:mariadb 3306]]
                :env            {"MYSQL_DATABASE"             "metabase_test"
                                 "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}
                :can-be-app-db? true}
   :mongo      {:image          "mongo:8"
                :internal-ports [[:mongo 27017]]
                :env            {"MONGO_INITDB_ROOT_USERNAME" "metabase"
                                 "MONGO_INITDB_ROOT_PASSWORD" "metasample123"}}
   :clickhouse {:image          "clickhouse/clickhouse-server:latest"
                :internal-ports [[:clickhouse-http 8123] [:clickhouse-nat 9000]]
                :env            {"CLICKHOUSE_USER"     "metabase"
                                 "CLICKHOUSE_PASSWORD" "metasample123"}}
   :ldap       {:image          "bitnami/openldap:latest"
                :internal-ports [[:ldap 1389]]
                :env            {"LDAP_ADMIN_USERNAME" "admin"
                                 "LDAP_ADMIN_PASSWORD" "adminpassword"}}
   :maildev    {:image          "maildev/maildev"
                :internal-ports [[:maildev-smtp 1025] [:maildev-ui 1080]]
                :env            {}}})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers

(defn- worktree-name
  "Last path component of the project root directory."
  []
  (let [path u/project-root-directory]
    (last (str/split path #"/"))))

(defn- compute-slot
  "Deterministic slot 0-99 from worktree name, or override."
  [slot-override]
  (if slot-override
    slot-override
    (mod (Math/abs (.hashCode ^String (worktree-name))) 100)))

(defn- container-prefix
  "Prefix for all docker containers for this worktree."
  []
  (str "mb-" (worktree-name) "-"))

(defn- port-for
  "Compute the port for a given service key and slot."
  [port-key slot]
  (+ (get port-bases port-key) slot))

(defn- kill-container!
  "Kill and remove a docker container (quiet, no error on missing)."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- check-docker!
  "Verify docker is available and the daemon is running."
  []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed. Please install Docker to use dev-env."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn- build-docker-cmd
  "Build a docker run command vector for a service."
  [container-name image port-mappings env-map]
  (into ["docker" "run" "-d"]
        (concat
         (mapcat (fn [[host-port internal-port]]
                   ["-p" (str host-port ":" internal-port)])
                 port-mappings)
         (mapcat (fn [[k v]]
                   ["-e" (str k "=" v)])
                 env-map)
         ["--name" container-name
          image])))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core

(defn- start-service!
  "Kill existing container and start a new one."
  [service-key suffix slot]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix) (name service-key) (when suffix (str "-" suffix)))
        port-key-src   (if (= suffix "app")
                         (:internal-ports spec)
                         (or (:wh-ports spec) (:internal-ports spec)))
        port-mappings  (mapv (fn [[pk ip]] [(port-for pk slot) ip]) port-key-src)
        cmd            (build-docker-cmd container-name (:image spec) port-mappings (:env spec))]
    (println (c/yellow "Starting " container-name "..."))
    (kill-container! container-name)
    (u/debug "Running: " (str/join " " cmd))
    (apply shell/sh cmd)
    (println (c/green "  Started ") container-name)))

(defn- validate-services!
  "Validate the app-db and --with values. Returns normalized config map."
  [{:keys [app-db with]}]
  (let [app-db-kw    (keyword app-db)
        with-kws     (mapv keyword with)
        valid-app-dbs #{:h2 :postgres :mysql :mariadb}
        valid-withs   #{:postgres :mysql :mariadb :mongo :clickhouse :ldap :maildev}]
    (when-not (valid-app-dbs app-db-kw)
      (println (c/red "Invalid --app-db: " app-db ". Must be one of: " (str/join ", " (map name valid-app-dbs))))
      (u/exit 1))
    (doseq [w with-kws]
      (when-not (valid-withs w)
        (println (c/red "Invalid --with: " (name w) ". Must be one of: " (str/join ", " (map name valid-withs))))
        (u/exit 1)))
    ;; Warn if --with overlaps with --app-db
    (when (and (not= app-db-kw :h2) (some #{app-db-kw} with-kws))
      (println (c/yellow "Note: --with " app-db " is redundant when --app-db is " app-db ". Using app-db container only.")))
    {:app-db  app-db-kw
     :with    (if (= app-db-kw :h2)
                with-kws
                (vec (remove #{app-db-kw} with-kws)))}))

(defn- generate-mise-local!
  "Generate mise.local.toml at the project root."
  [slot {:keys [app-db]}]
  (let [wt-name (worktree-name)
        lines   (cond-> [(str "# Auto-generated by ./bin/mage -edpaget-dev-env")
                         (str "# Worktree: " wt-name " (slot " slot ")")
                         (str "# Re-run `./bin/mage -edpaget-dev-env` to regenerate.")
                         ""
                         "[env]"
                         (str "MB_JETTY_PORT = \"" (port-for :jetty slot) "\"")
                         (str "MB_FRONTEND_DEV_PORT = \"" (port-for :frontend-dev slot) "\"")
                         (str "NREPL_PORT = \"" (port-for :nrepl slot) "\"")
                         (str "SOCKET_REPL_PORT = \"" (port-for :socket-repl slot) "\"")]
                  (= app-db :postgres)
                  (conj (str "MB_DB_TYPE = \"postgres\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:postgresql://localhost:"
                             (port-for :postgres-app slot)
                             "/metabase?user=metabase&password=password\""))

                  (= app-db :mysql)
                  (conj (str "MB_DB_TYPE = \"mysql\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mysql slot)
                             "/metabase?user=root&password=\""))

                  (= app-db :mariadb)
                  (conj (str "MB_DB_TYPE = \"mysql\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mariadb slot)
                             "/metabase?user=root&password=\"")))
        content (str (str/join "\n" lines) "\n")
        path    (str u/project-root-directory "/mise.local.toml")]
    (spit path content)
    (println (c/green "Wrote " path))))

(defn- print-summary!
  "Print a summary table of ports, containers, and connection info."
  [slot {:keys [app-db with]}]
  (let [wt-name (worktree-name)
        rows    (cond-> [{:service "Jetty backend"  :port (port-for :jetty slot)        :env-var "MB_JETTY_PORT"}
                         {:service "Frontend dev"   :port (port-for :frontend-dev slot)  :env-var "MB_FRONTEND_DEV_PORT"}
                         {:service "nREPL"          :port (port-for :nrepl slot)         :env-var "NREPL_PORT"}
                         {:service "Socket REPL"    :port (port-for :socket-repl slot)   :env-var "SOCKET_REPL_PORT"}]

                  (= app-db :postgres)
                  (conj {:service "Postgres (app-db)" :port (port-for :postgres-app slot) :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mysql)
                  (conj {:service "MySQL (app-db)" :port (port-for :mysql slot) :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mariadb)
                  (conj {:service "MariaDB (app-db)" :port (port-for :mariadb slot) :env-var "MB_DB_CONNECTION_URI"})

                  (some #{:postgres} with)
                  (conj {:service "Postgres (warehouse)" :port (port-for :postgres-wh slot) :env-var ""})

                  (some #{:mysql} with)
                  (conj {:service "MySQL (warehouse)" :port (port-for :mysql slot) :env-var ""})

                  (some #{:mariadb} with)
                  (conj {:service "MariaDB (warehouse)" :port (port-for :mariadb slot) :env-var ""})

                  (some #{:mongo} with)
                  (conj {:service "MongoDB" :port (port-for :mongo slot) :env-var ""})

                  (some #{:clickhouse} with)
                  (conj {:service "ClickHouse HTTP" :port (port-for :clickhouse-http slot) :env-var ""}
                        {:service "ClickHouse native" :port (port-for :clickhouse-nat slot) :env-var ""})

                  (some #{:ldap} with)
                  (conj {:service "OpenLDAP" :port (port-for :ldap slot) :env-var ""})

                  (some #{:maildev} with)
                  (conj {:service "Maildev SMTP" :port (port-for :maildev-smtp slot) :env-var ""}
                        {:service "Maildev UI" :port (port-for :maildev-ui slot) :env-var ""}))]
    (println)
    (println (c/bold (c/green "Dev environment for ") (c/cyan wt-name) (c/green " (slot " slot ")")))
    (println)
    (t/table rows :style :unicode)
    (println)
    (println (c/cyan "Open a new shell in this worktree for mise to pick up the env vars."))
    (println (c/cyan "Tear down with: ") (c/yellow "./bin/mage -edpaget-dev-env --down"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Entry points

(defn- stand-up!
  "Orchestrate: validate -> check docker -> start containers -> write toml -> print summary."
  [opts]
  (let [slot   (compute-slot (:slot opts))
        config (validate-services! opts)]
    (check-docker!)
    ;; Start app-db container if not H2
    (when (not= (:app-db config) :h2)
      (start-service! (:app-db config) "app" slot))
    ;; Start warehouse containers
    (doseq [svc (:with config)]
      (start-service! svc "wh" slot))
    ;; Write mise.local.toml
    (generate-mise-local! slot config)
    ;; Print summary
    (print-summary! slot config)))

(defn- tear-down!
  "Find all containers for this worktree, kill/rm them, delete mise.local.toml."
  []
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}")
        containers (when (seq out)
                     (->> out
                          (remove str/blank?)
                          vec))]
    (if (seq containers)
      (do
        (println (c/yellow "Stopping containers:"))
        (doseq [cname containers]
          (println (c/red "  Killing " cname))
          (kill-container! cname))
        (println (c/green "All containers stopped.")))
      (println (c/yellow "No containers found for prefix: " prefix)))
    ;; Remove mise.local.toml
    (let [toml-path (str u/project-root-directory "/mise.local.toml")]
      (when (.exists (java.io.File. toml-path))
        (.delete (java.io.File. toml-path))
        (println (c/green "Removed " toml-path))))))

(defn- print-status!
  "Show running containers for this worktree."
  []
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}\t{{.Status}}\t{{.Ports}}")
        lines      (when (seq out)
                     (->> out (remove str/blank?) vec))]
    (if (seq lines)
      (let [rows (mapv (fn [line]
                         (let [[cname status ports] (str/split line #"\t" 3)]
                           {:container cname
                            :status    (or status "")
                            :ports     (or ports "")}))
                       lines)]
        (println (c/bold (c/green "Containers for " (worktree-name) ":")))
        (println)
        (t/table rows :style :unicode))
      (println (c/yellow "No containers found for " (worktree-name))))))

(defn dev-env!
  "Top-level dispatcher for dev-env command."
  [{:keys [options]}]
  (let [{:keys [down status]} options]
    (cond
      down   (tear-down!)
      status (print-status!)
      :else  (stand-up! (-> options
                            (update :app-db #(or % "h2")))))))
