(ns mage.bot.dev-env-core
  "Shared dev-env infrastructure: port allocation, Docker container management,
   and service specs. Used by both bot/dev_env and nvoxland/dev_env."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port bases — canonical source for all port allocation

(def port-bases
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

(def service-specs
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

;; Services that use a shared local instance rather than a per-worktree Docker container.
(def shared-db-services #{:postgres :mysql :mariadb :mongo})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port/name helpers

(defn worktree-name
  "Last path component of the given root directory."
  [root-dir]
  (last (str/split root-dir #"/")))

(defn db-name
  "Database name for this worktree: worktree name with non-alphanumeric chars replaced by _."
  [root-dir]
  (str/replace (worktree-name root-dir) #"[^a-zA-Z0-9_]" "_"))

(defn compute-slot
  "Deterministic slot 0-99 from worktree name, or override."
  [root-dir slot-override]
  (if slot-override
    slot-override
    (mod (Math/abs (.hashCode ^String (worktree-name root-dir))) 100)))

(defn container-prefix
  "Prefix for all docker containers for this worktree."
  [root-dir]
  (str "mb-" (worktree-name root-dir) "-"))

(defn port-for
  "Compute the port for a given service key and slot."
  [port-key slot]
  (+ (get port-bases port-key) slot))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Docker helpers

(defn check-docker!
  "Verify docker is available and the daemon is running."
  []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed. Please install Docker to use dev-env."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn kill-container!
  "Kill and remove a docker container (quiet, no error on missing)."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn build-docker-cmd
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

(defn start-service!
  "Kill existing container and start a new one.
   suffix is typically \"app\" or \"wh\" (warehouse)."
  [root-dir service-key suffix slot]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix root-dir) (name service-key) (when suffix (str "-" suffix)))
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

(defn kill-all-containers!
  "Kill all containers matching this worktree's prefix."
  [root-dir]
  (let [prefix     (container-prefix root-dir)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}")
        containers (when (seq out)
                     (->> out (remove str/blank?) vec))]
    (if (seq containers)
      (do
        (println (c/yellow "Stopping containers:"))
        (doseq [cname containers]
          (println (c/red "  Killing " cname))
          (kill-container! cname))
        (println (c/green "All containers stopped.")))
      (println (c/yellow "No containers found for prefix: " prefix)))))

(defn list-containers
  "List containers for this worktree. Returns seq of {:container :status :ports} maps."
  [root-dir]
  (let [prefix     (container-prefix root-dir)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}\t{{.Status}}\t{{.Ports}}")
        lines      (when (seq out)
                     (->> out (remove str/blank?) vec))]
    (when (seq lines)
      (mapv (fn [line]
              (let [[cname status ports] (str/split line #"\t" 3)]
                {:container cname
                 :status    (or status "")
                 :ports     (or ports "")}))
            lines))))
