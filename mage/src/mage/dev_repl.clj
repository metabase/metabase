(ns mage.dev-repl
  (:require
   [babashka.fs :as fs]
   [babashka.http-client :as http]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.net ServerSocket)))

(set! *warn-on-reflection* true)

(defn- find-free-port
  "Finds a free port"
  []
  (with-open [socket (ServerSocket. 0)]
    (.getLocalPort socket)))

(defn- port-in-use?
  "Returns true if the port cannot be bound."
  [port]
  (try
    (with-open [_socket (ServerSocket. port)]
      false)
    (catch Exception _ true)))

(def ^:private backend-port-options [3000 3001 3002 3003 3004])

(defn- format-port-option [port]
  (str port (when (port-in-use? port) " [in use]")))

(defn- parse-port [s]
  (when-let [m (re-find #"\d+" (str s))]
    (Integer/parseInt m)))

;; Worktree / checkout helpers
(defn- worktree-id
  []
  (let [path (.getCanonicalPath (java.io.File. u/project-root-directory))
        digest (java.security.MessageDigest/getInstance "SHA-1")
        hex (->> (.digest digest (.getBytes path "UTF-8"))
                 (map #(format "%02x" (bit-and % 0xff)))
                 (apply str))]
    (subs hex 0 8)))

(defn- h2-db-base-path [worktree-id]
  (str "/tmp/metabase-h2/" worktree-id "/metabase"))

(defn- ensure-h2-dir! [base-path]
  (fs/create-dirs (fs/parent base-path)))

(defn- delete-h2-files! [base-path]
  (doseq [suffix ["" ".mv.db" ".trace.db" ".h2.db" ".lock.db"]]
    (fs/delete-if-exists (str base-path suffix))))

;; Token env var mapping (expects MBDEV_*_TOKEN in env)
(def token-env-vars
  {:all-features    "MBDEV_ALL_FEATURES_TOKEN"
   :starter-cloud   "MBDEV_STARTER_CLOUD_TOKEN"
   :pro-cloud       "MBDEV_PRO_CLOUD_TOKEN"
   :pro-self-hosted "MBDEV_PRO_SELF_HOSTED_TOKEN"})

;; Container management with dynamic ports and reuse
(defn- container-name [worktree-id db-type version]
  (format "mb-dev-%s-%s-%s" worktree-id (name db-type) (name version)))

(defn- container-internal-port [db-type]
  (case db-type
    :postgres 5432
    (:mysql :mariadb) 3306))

(defn- docker-image [db-type version]
  (str (name db-type) ":" (name version)))

(defn- docker-env-vars [db-type]
  (case db-type
    :postgres ["-e" "POSTGRES_USER=metabase"
               "-e" "POSTGRES_PASSWORD=password"
               "-e" "POSTGRES_DB=metabase"]
    (:mysql :mariadb) ["-e" "MYSQL_DATABASE=metabase_test"
                       "-e" "MYSQL_ALLOW_EMPTY_PASSWORD=yes"]))

(defn- db-shell-command
  "Return a shell command to connect to the DB, or nil if unavailable."
  [db-type db-info h2-path h2-tcp-port]
  (case db-type
    :postgres (when-let [name (:name db-info)]
                (format "docker exec -it %s psql -U metabase -d metabase" name))
    :mysql (when-let [name (:name db-info)]
             (format "docker exec -it %s mysql -uroot metabase_test" name))
    :mariadb (when-let [name (:name db-info)]
               (format "docker exec -it %s mariadb -uroot metabase_test" name))
    :h2 (when (and h2-path h2-tcp-port)
          (format "clojure -M:dev:connect-to-h2-tcp --port %s --db-file %s" h2-tcp-port h2-path))
    nil))

(defn- label-width
  "Compute max label width (including trailing colon) plus one space for alignment."
  [labels]
  (inc (apply max (map #(count (str % ":")) labels))))

(defn- format-section-line
  "Format a section line with aligned label/value and optional coloring."
  [label value width label-color value-color]
  (let [label-text (str label ":")
        pad-count  (max 0 (- width (count label-text)))
        padding    (apply str (repeat pad-count " "))
        label-str  (if label-color (label-color label-text) label-text)
        value-str  (if value-color (value-color (str value)) (str value))]
    (str "  " label-str padding value-str)))

(defn- container-running? [name]
  (let [output (u/sh "docker" "ps" "-q" "--filter" (str "name=^" name "$"))]
    (not (str/blank? output))))

(defn- container-exists? [name]
  (let [output (u/sh "docker" "ps" "-aq" "--filter" (str "name=^" name "$"))]
    (not (str/blank? output))))

(defn- get-container-port
  "Get the host port for a running container."
  [name internal-port]
  (let [output (u/sh "docker" "port" name (str internal-port))]
    (when-let [[_ port] (re-find #":(\d+)$" output)]
      (Integer/parseInt port))))

(defn- create-db-container!
  "Create a new DB container with a random port. Returns the host port."
  [db-type version name]
  (let [internal-port (container-internal-port db-type)
        image (docker-image db-type version)
        env-vars (docker-env-vars db-type)]
    (println (c/green "Creating database container:") name)
    (println (c/cyan "  Image:") image)
    (apply shell/sh* "docker" "run" "-d"
           "--name" name
           "-p" (str "0:" internal-port) ; 0 = random port
           (concat env-vars [image]))
    ;; Wait a moment for container to start
    (Thread/sleep 1000)
    (let [port (get-container-port name internal-port)]
      (println (c/cyan "  Port:") port)
      port)))

(defn- ask-reuse-container?
  "Ask user whether to reuse existing container."
  [name running?]
  (println (c/yellow "Found existing container:") name
           (if running? "(running)" "(stopped)"))
  (let [choice (u/fzf-select! ["Reuse existing" "Create fresh"]
                              "--height=10 --layout=reverse --prompt='Database container: '")]
    (= choice "Reuse existing")))

(defn- ensure-db!
  "Ensure DB container is running. Returns {:port :stop-on-exit? :name}.
   - If fresh?, remove existing and create new with random port
   - If container exists, ask user whether to reuse
   - If missing, create new with random port

   :stop-on-exit? is true if we created or started the container (so we should stop it on exit)"
  [worktree-id db-type db-version fresh?]
  (let [name (container-name worktree-id db-type db-version)
        internal-port (container-internal-port db-type)
        running? (container-running? name)
        exists? (or running? (container-exists? name))]
    (cond
      ;; --fresh flag: always create new
      fresh?
      (do
        (println (c/yellow "Fresh database requested, creating new container..."))
        (when exists?
          (shell/sh* {:quiet? true} "docker" "rm" "-f" name))
        {:port (create-db-container! db-type db-version name)
         :stop-on-exit? true
         :name name})

      ;; Container exists: ask user whether to reuse
      (and exists? (ask-reuse-container? name running?))
      (do
        (when-not running?
          (println (c/green "Starting stopped container:") name)
          (shell/sh* "docker" "start" name)
          (Thread/sleep 1000))
        {:port (get-container-port name internal-port)
         :stop-on-exit? (not running?) ; stop if we started it, leave alone if was already running
         :name name})

      ;; User chose fresh, or no container exists
      :else
      (do
        (when exists?
          (println (c/yellow "Removing existing container..."))
          (shell/sh* {:quiet? true} "docker" "rm" "-f" name))
        {:port (create-db-container! db-type db-version name)
         :stop-on-exit? true
         :name name}))))

(defn- stop-container! [name]
  (println)
  (println (c/yellow "Stopping database container:") name)
  (shell/sh* {:quiet? true} "docker" "stop" name))

(defn- wait-for-backend!
  "Poll the health endpoint until the backend is ready. Prints progress dots."
  [port]
  (let [url (str "http://localhost:" port "/api/health")]
    (loop [attempts 0]
      (Thread/sleep 2000)
      (let [healthy? (try
                       (let [resp (http/get url {:throw false :timeout 2000})]
                         (and (= 200 (:status resp))
                              (str/includes? (:body resp) "\"status\":\"ok\"")))
                       (catch Exception _ false))]
        (if healthy?
          (println (c/green " healthy!"))
          (do
            (print ".")
            (flush)
            (when (< attempts 120) ; ~4 minutes max
              (recur (inc attempts)))))))))

;; Token validation
(defn- validate-token! [token]
  (when (and token (not= token :none))
    (let [env-var (get token-env-vars token)
          value   (System/getenv env-var)]
      (when (str/blank? value)
        (println (c/red "WARNING:") (c/yellow env-var) "is not set!")
        (println "Set this env var with your" (name token) "token, or use --token none")
        (u/exit 1)))))

(def ^:private fzf-opts "--height=10 --layout=reverse")

;; FZF prompts (or use CLI args)
(defn- select-edition [opts]
  (or (some-> (:edition opts) keyword)
      (keyword (u/fzf-select! ["ee" "oss"] (str fzf-opts " --prompt='Edition: '")))))

(defn- select-token [opts]
  (or (some-> (:token opts) keyword)
      (keyword (u/fzf-select!
                ["all-features" "starter-cloud" "pro-cloud" "pro-self-hosted" "none"]
                (str fzf-opts " --prompt='Token: '")))))

(defn- select-db [opts]
  (or (some-> (:db opts) keyword)
      (keyword (u/fzf-select! ["postgres" "mysql" "mariadb" "h2"] (str fzf-opts " --prompt='Database: '")))))

(defn- select-config [opts]
  (or (:config opts)
      (let [files (u/shl "find" "dev" "-name" "*.yml" "-o" "-name" "*.yaml")
            selected (if (seq files)
                       (u/fzf-select! (conj files "none") (str fzf-opts " --prompt='Config file: '"))
                       (u/fzf-select! ["dev/config.yml" "none"] (str fzf-opts " --prompt='Config file: '")))]
        (when-not (= selected "none")
          selected))))

(defn- select-port [opts]
  (or (:port opts)
      (let [options (mapv format-port-option backend-port-options)
            ;; become() replaces fzf with shell cmd - echo selection if exists, else query
            input (u/fzf-select! options
                                 (str fzf-opts " --prompt='Backend port: '"
                                      " --bind 'enter:become([ -n {} ] && echo {} || echo {q})'"))]
        (if-let [port (parse-port (str/trim input))]
          port
          (do
            (println (c/red "Invalid port selection:") input)
            (u/exit 1))))))

;; Build env map
(defn- build-env [edition token config-file db-type db-port frontend-port backend-port h2-path]
  (cond-> {"MB_EDITION" (name edition)
           "MB_ENABLE_TEST_ENDPOINTS" "true"
           "MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE" "true"}

    ;; Backend port
    backend-port
    (assoc "MB_JETTY_PORT" (str backend-port))

    ;; Frontend port
    frontend-port
    (assoc "MB_FRONTEND_DEV_PORT" (str frontend-port))

    ;; EE token
    (and (= edition :ee) (not= token :none))
    (assoc "MB_PREMIUM_EMBEDDING_TOKEN" (System/getenv (get token-env-vars token))
           "METASTORE_DEV_SERVER_URL" "https://token-check.staging.metabase.com"
           "MB_CONFIG_FILE_PATH" config-file)

    ;; Database (non-H2)
    (not= db-type :h2)
    (assoc "MB_DB_TYPE" (if (= db-type :mariadb) "mysql" (name db-type))
           "MB_DB_CONNECTION_URI"
           (case db-type
             :postgres (format "postgresql://metabase:password@localhost:%s/metabase" db-port)
             (:mysql :mariadb) (format "mysql://root@localhost:%s/metabase_test" db-port)))

    ;; H2
    (= db-type :h2)
    (assoc "MB_DB_TYPE" "h2"
           "MB_DB_FILE" h2-path)))

;; Frontend dev server
(defn- start-frontend!
  "Start the frontend dev server in the background. Returns {:port :log-file}."
  [edition port]
  (let [log-file (str "/tmp/metabase-frontend-" port ".log")]
    (let [log (java.io.File. log-file)]
      (p/process {:dir u/project-root-directory
                  :out log
                  :err log
                  :extra-env {"MB_FRONTEND_DEV_PORT" (str port)
                              "MB_EDITION" (name edition)}}
                 "yarn" "build-hot"))
    {:port port :log-file log-file}))

;; Build aliases
;; Uses :dev-start which runs user/-main - starts nREPL + Metabase
(defn- build-aliases [edition]
  (str ":dev:dev-start:drivers:drivers-dev"
       (when (= edition :ee) ":ee:ee-dev")))

;; Main entry point
(defn dev-repl [{:keys [options]} _task-opts]
  (let [edition    (select-edition options)
        token      (when (= edition :ee) (select-token options))
        _          (validate-token! token)
        config     (when (and (= edition :ee) (not= token :none))
                     (select-config options))
        db-type    (select-db options)
        db-version (keyword (or (:db-version options) "latest"))
        fresh?     (:fresh options)
        no-frontend? (:no-frontend options)
        backend-port (select-port options)
        worktree-id (worktree-id)
        _          (when (port-in-use? backend-port)
                     (println (c/yellow "WARNING:") "Port" backend-port "appears to be in use; startup may fail."))

        ;; Start frontend dev server (unless --no-frontend)
        frontend (when-not no-frontend?
                   (start-frontend! edition (find-free-port)))
        frontend-port (:port frontend)
        frontend-log (:log-file frontend)

        h2-path    (when (= db-type :h2)
                     (h2-db-base-path worktree-id))
        h2-tcp-port (when (= db-type :h2)
                      (find-free-port))
        _          (when h2-path
                     (ensure-h2-dir! h2-path))
        _          (when (and h2-path fresh?)
                     (delete-h2-files! h2-path))

        ;; Ensure DB container (reuse if exists, unless --fresh)
        db-info    (when (not= db-type :h2)
                     (ensure-db! worktree-id db-type db-version fresh?))
        db-port    (:port db-info)

        env-map    (build-env edition token config db-type db-port frontend-port backend-port h2-path)
        aliases    (build-aliases edition)
        backend-log (str "/tmp/metabase-backend-" backend-port ".log")]

    (let [nrepl-port (find-free-port)
          cmd (cond-> ["clojure" (str "-M" aliases) "-p" (str nrepl-port)]
                h2-tcp-port (conj "--h2-tcp-port" (str h2-tcp-port)))]
      ;; Show config
      (let [info-width (label-width ["Edition" "Token" "Config" "Database" "Aliases"])
            logs-width (label-width ["FE" "BE"])
            conn-width (label-width ["nREPL" "DB"])
            db-shell   (db-shell-command db-type db-info h2-path h2-tcp-port)]
        (println)
        (println (c/bold "Starting Metabase Dev REPL (Press Ctrl-C to Stop):"))
        (println (format-section-line "Edition" (name edition) info-width c/cyan nil))
        (when token
          (println (format-section-line "Token" (name token) info-width c/cyan nil)))
        (when config
          (println (format-section-line "Config" config info-width c/cyan nil)))
        (println (format-section-line "Database" (name db-type) info-width c/cyan nil))
        (println (format-section-line "Aliases" aliases info-width c/cyan nil))
        (println)
        (println (c/bold "Logs:"))
        (when frontend-log
          (println (format-section-line "FE" (str "tail -f " frontend-log) logs-width c/yellow c/yellow)))
        (println (format-section-line "BE" (str "tail -f " backend-log) logs-width c/yellow c/yellow))
        (println)
        (println (c/bold "Connectivity:"))
        (println (format-section-line "nREPL" (str nrepl-port) conn-width c/green c/green))
        (when db-shell
          (println (format-section-line "DB" db-shell conn-width c/green c/green)))
        (println))

      ;; Launch backend (output to log file)
      (let [log-file (java.io.File. backend-log)
            proc (apply p/process {:dir u/project-root-directory
                                   :out log-file
                                   :err log-file
                                   :extra-env env-map}
                        cmd)
            cleanup! (fn []
                       (p/destroy-tree proc)
                       (when (:stop-on-exit? db-info)
                         (stop-container! (:name db-info))))]

        ;; Register SIGINT handler for Ctrl+C cleanup
        (sun.misc.Signal/handle
         (sun.misc.Signal. "INT")
         (reify sun.misc.SignalHandler
           (handle [_ _]
             (cleanup!)
             (System/exit 0))))

        (print (c/bold (format (str (c/green "Starting Metabase server (" (c/red "http://localhost:%s") (c/green "), waiting for healthy status"))) backend-port)))
        (print "...")
        (flush)
        ;; Poll health endpoint in background
        (future (wait-for-backend! backend-port))
        ;; Wait for backend process to exit
        @proc
        ;; Normal exit cleanup
        (cleanup!)))))
