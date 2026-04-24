(ns mage.bot.status
  "Autobot status monitor — watches .bot/autobot/llm-status.txt and checks service health.

   Supports two modes:
   - **Local dev mode:** reads mise.local.toml for backend/frontend/DB ports and polls their health locally.
   - **PR-env mode:** reads .bot/pr-env.env for the remote BASE_URL and polls that instead.
     No local ports, no DB check."
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.bot.pr-env :as pr-env]
   [mage.color :as c]
   [mage.nvoxland.env :as bot-env]
   [mage.shell :as shell])
  (:import
   (java.io File)
   (java.net Socket)))

(set! *warn-on-reflection* true)

(defn- extract-port
  "Extract port number from a string, trying env value directly or parsing from JDBC URL."
  [^String s]
  (when s
    (or (try (Integer/parseInt s) (catch Exception _ nil))
        (when-let [[_ port-str] (re-find #"(?:localhost|host\.docker\.internal):(\d+)" s)]
          (Integer/parseInt port-str)))))

(defn- extract-db-host
  "Extract the DB host from a JDBC URL."
  [^String s]
  (when s
    (when-let [[_ host] (re-find #"//([^:/]+)" s)]
      host)))

(defn- check-http
  "Try an HTTP GET. Returns :ready, :unhealthy, or :waiting."
  [^String url timeout-ms]
  (try
    (let [resp (http/get url {:timeout (int timeout-ms)
                              :throw false})
          code (:status resp)]
      (if (<= 200 code 399) :ready :unhealthy))
    (catch java.net.ConnectException _ :waiting)
    (catch Exception _ :unhealthy)))

(defn- check-tcp
  "Try a TCP connection. Returns :ready or :waiting."
  [^String host port timeout-ms]
  (try
    (let [sock (Socket.)]
      (.connect sock (java.net.InetSocketAddress. host ^int (int port)) (int timeout-ms))
      (.close sock)
      :ready)
    (catch Exception _ :waiting)))

(defn- load-ports
  "Read mise.local.toml and extract ports. Returns a map or nil if file not ready."
  []
  (when-let [env (bot-env/read-mise-local-toml)]
    (let [jetty-port    (extract-port (get env "MB_JETTY_PORT"))
          frontend-port (extract-port (get env "MB_FRONTEND_DEV_PORT"))
          db-uri        (get env "MB_DB_CONNECTION_URI")
          db-type-str   (get env "MB_DB_TYPE")
          db-type       (when db-type-str (keyword db-type-str))
          db-port       (extract-port db-uri)
          db-host       (extract-db-host db-uri)]
      (when jetty-port
        {:jetty-port    jetty-port
         :frontend-port frontend-port
         :db-type       db-type
         :db-port       db-port
         :db-host       (or db-host "localhost")}))))

(defn- check-pr
  "Check if there's an open PR for the current branch. Returns {:url ... :number ...} or nil."
  []
  (try
    (let [result (shell/sh* {:quiet? true} "gh" "pr" "view" "--json" "url,number,state")]
      (when (zero? (:exit result))
        (let [data (json/read-str (str/join "\n" (:out result)) {:key-fn keyword})]
          (when (= "OPEN" (:state data))
            {:url (:url data) :number (:number data)}))))
    (catch Exception _ nil)))

(defn- render-display
  "Render the full status pane display.

   mode is either :local (port-based) or :pr-env (remote URL).
   In :pr-env mode, `ports` is nil and the first line is derived from pr-env-cfg."
  [mode ports pr-env-cfg be-status db-status llm-status pr-info]
  (let [sb (StringBuilder.)]
    (case mode
      :local
      (when ports
        (let [be-up?      (= be-status :ready)
              mb-color    (if be-up? c/green c/red)
              mb-text     (str (if be-up? "http" "error") "://localhost:" (:jetty-port ports))
              db-name     (when (:db-type ports)
                            (str/upper-case (name (:db-type ports))))
              db-color    (if (= db-status :ready) c/green c/red)
              db-text     (when (and db-name (:db-port ports))
                            (str db-name ": " (:db-port ports)))]
          (.append sb (mb-color mb-text))
          (when db-text
            (.append sb " | ")
            (.append sb (db-color db-text)))
          (when pr-info
            (.append sb (str " | " (c/green (str "PR #" (:number pr-info))))))
          (.append sb "\n")))

      :pr-env
      (let [be-up?     (= be-status :ready)
            mb-color   (if be-up? c/green c/red)
            base-url   (get pr-env-cfg "BASE_URL")
            pr-num     (get pr-env-cfg "PR_NUM")
            mb-text    (if be-up? base-url (str "error: " base-url))]
        (.append sb (mb-color mb-text))
        (when pr-num
          (.append sb (str " | " (c/green (str "PR #" pr-num)))))
        (.append sb (str " | " (c/yellow "pr-env mode")))
        (.append sb "\n")))

    ;; Blank line + LLM status
    (when (seq llm-status)
      (.append sb "\n")
      (.append sb llm-status)
      (.append sb "\n"))
    (.toString sb)))

(defn run!
  "Watch llm-status.txt and periodically check service health.
   Auto-detects PR-env mode via .bot/pr-env.env."
  [{:keys [arguments]}]
  (let [file-path   (or (first arguments) ".bot/autobot/llm-status.txt")
        f           (File. ^String file-path)
        pr-env-cfg  (when (pr-env/pr-env-active?) (pr-env/load-pr-env))
        mode        (if pr-env-cfg :pr-env :local)
        ;; Seed last-output with a sentinel so the first tick always prints
        ;; (even if render-display returns an empty string, the sentinel is
        ;; different, so we print the initial state immediately).
        startup-line (case mode
                       :pr-env (str "Starting status monitor for PR env " (get pr-env-cfg "BASE_URL") "...\n")
                       :local  "Starting status monitor (local dev mode, waiting for mise.local.toml)...\n")]
    (println startup-line)
    (flush)
    (loop [last-output    startup-line
           ports          nil
           pr-info        nil
           last-be-status :unhealthy
           last-db-status :unhealthy
           tick           0]
      (let [check?    (zero? (mod tick 5))
            pr-check? (and (not pr-info) (zero? (mod tick 30)))
            ports     (or ports (when (and check? (= mode :local)) (load-ports)))
            pr-info   (or pr-info (when pr-check? (check-pr)))
            be-status (cond
                        (and check? (= mode :local) ports)
                        (check-http (str "http://localhost:" (:jetty-port ports) "/api/health") 2000)

                        (and check? (= mode :pr-env) pr-env-cfg)
                        (check-http (str (get pr-env-cfg "BASE_URL") "/api/health") 5000)

                        :else
                        last-be-status)
            db-status (if (and check? (= mode :local) ports (:db-port ports))
                        (check-tcp (:db-host ports) (:db-port ports) 2000)
                        last-db-status)
            llm-status (when (.exists f)
                         (str/trim (slurp f)))
            output    (render-display mode ports pr-env-cfg be-status db-status llm-status pr-info)]
        (when (not= output last-output)
          (println "=========================================\n")
          (print output)
          (flush))
        (Thread/sleep 1000)
        (recur output ports pr-info be-status db-status (inc tick))))))
