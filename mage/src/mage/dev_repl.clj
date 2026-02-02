(ns mage.dev-repl
  (:require
   [babashka.http-client :as http]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.net ServerSocket)))

(set! *warn-on-reflection* true)

;; Port utilities
(defn- find-free-port
  "Find a free port by binding to port 0 and reading the assigned port."
  []
  (with-open [socket (ServerSocket. 0)]
    (.getLocalPort socket)))

;; Token env var mapping (expects MBDEV_*_TOKEN in env)
(def token-env-vars
  {:all-features    "MBDEV_ALL_FEATURES_TOKEN"
   :starter-cloud   "MBDEV_STARTER_CLOUD_TOKEN"
   :pro-cloud       "MBDEV_PRO_CLOUD_TOKEN"
   :pro-self-hosted "MBDEV_PRO_SELF_HOSTED_TOKEN"})

;; Container management with dynamic ports and reuse
(defn- container-name [db-type version]
  (format "mb-dev-%s-%s" (name db-type) (name version)))

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
  [db-type db-version fresh?]
  (let [name (container-name db-type db-version)
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
  "Poll the health endpoint until the backend is ready."
  [port]
  (let [url (str "http://localhost:" port "/api/health")]
    (print (c/cyan "Waiting for backend to start..."))
    (flush)
    (loop [attempts 0]
      (Thread/sleep 2000)
      (let [healthy? (try
                       (let [resp (http/get url {:throw false :timeout 2000})]
                         (and (= 200 (:status resp))
                              (str/includes? (:body resp) "\"status\":\"ok\"")))
                       (catch Exception _ false))]
        (if healthy?
          (println (c/green " ready!"))
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
      (let [;; become() replaces fzf with shell cmd - echo selection if exists, else query
            input (u/fzf-select! ["3000" "3001" "3002" "3003" "3004"]
                                 (str fzf-opts " --prompt='Backend port: '"
                                      " --bind 'enter:become([ -n {} ] && echo {} || echo {q})'"))]
        (Integer/parseInt (str/trim input)))))

;; Build env map
(defn- build-env [edition token config-file db-type db-port frontend-port backend-port]
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
           "MB_DB_FILE" (format "/tmp/metabase_%d" (System/currentTimeMillis)))))

;; Frontend dev server
(defn- start-frontend!
  "Start the frontend dev server in the background. Returns {:port :log-file}."
  [edition port]
  (let [log-file (str "/tmp/metabase-frontend-" port ".log")]
    (println (c/green "Starting frontend dev server on port") (c/cyan port))
    (println (c/cyan "  Log file:") log-file)
    (println (c/cyan "  Tail with:") (str "tail -f " log-file))
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

        ;; Start frontend dev server (unless --no-frontend)
        frontend (when-not no-frontend?
                   (start-frontend! edition (find-free-port)))
        frontend-port (:port frontend)
        frontend-log (:log-file frontend)

        ;; Ensure DB container (reuse if exists, unless --fresh)
        db-info    (when (not= db-type :h2)
                     (ensure-db! db-type db-version fresh?))
        db-port    (:port db-info)

        env-map    (build-env edition token config db-type db-port frontend-port backend-port)
        aliases    (build-aliases edition)
        nrepl-port (find-free-port)
        cmd        ["clojure" (str "-M" aliases) "-p" (str nrepl-port)]
        backend-log (str "/tmp/metabase-backend-" backend-port ".log")]

    ;; Show config
    (println)
    (println (c/green "Starting Metabase:"))
    (println (c/cyan "  Edition:") (name edition))
    (when token (println (c/cyan "  Token:") (name token)))
    (when config (println (c/cyan "  Config:") config))
    (println (c/cyan "  Database:") (str (name db-type) (when db-port (str " on port " db-port))))
    (println (c/cyan "  nREPL:") (str "port " nrepl-port " (cider-connect)"))
    (println (c/cyan "  Aliases:") aliases)
    (when frontend-port
      (println (c/cyan "  Frontend:") (str "http://localhost:" frontend-port))
      (println (c/cyan "  FE logs:") (str "tail -f " frontend-log)))
    (println (c/cyan "  BE logs:") (str "tail -f " backend-log))
    (println (c/cyan "  Backend:") (str "http://localhost:" backend-port))
    (println)

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

      (println)
      (println (c/cyan "Press Ctrl+C to stop."))
      (println)
      ;; Poll health endpoint in background
      (future (wait-for-backend! backend-port))
      ;; Wait for backend process to exit
      @proc
      ;; Normal exit cleanup
      (cleanup!))))
