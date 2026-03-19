(ns mage.fixbot.status-watch
  (:require
   [clojure.string :as str])
  (:import
   (java.io File)
   (java.net HttpURLConnection URL Socket)))

(set! *warn-on-reflection* true)

(defn- parse-mise-env
  "Parse key=value pairs from mise.local.toml [env] section.
   Returns a map of env var name -> value (unquoted)."
  [^String path]
  (when (.exists (File. path))
    (let [lines (str/split-lines (slurp path))]
      (->> lines
           (keep (fn [line]
                   (when-let [[_ k v] (re-matches #"\s*(\w+)\s*=\s*\"([^\"]*)\"\s*" line)]
                     [k v])))
           (into {})))))

(defn- extract-port
  "Extract port number from a string, trying env value directly or parsing from JDBC URL."
  [^String s]
  (when s
    (or (try (Integer/parseInt s) (catch Exception _ nil))
        (when-let [[_ port-str] (re-find #"localhost:(\d+)" s)]
          (Integer/parseInt port-str)))))

(defn- check-http
  "Try an HTTP GET. Returns :ready, :unhealthy, or :waiting."
  [^String url timeout-ms]
  (try
    (let [conn (doto ^HttpURLConnection (.openConnection (URL. url))
                 (.setRequestMethod "GET")
                 (.setConnectTimeout (int timeout-ms))
                 (.setReadTimeout (int timeout-ms)))
          code (.getResponseCode conn)]
      (.disconnect conn)
      (if (<= 200 code 399) :ready :unhealthy))
    (catch java.net.ConnectException _ :waiting)
    (catch java.net.SocketTimeoutException _ :unhealthy)
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

(def ^:private green "\033[32m")
(def ^:private red "\033[31m")
(def ^:private yellow "\033[33m")
(def ^:private reset "\033[0m")

(defn- colorize [color text]
  (str color text reset))

(defn- load-ports
  "Read mise.local.toml and extract ports. Returns a map or nil if file not ready."
  [^String mise-path]
  (when-let [env (parse-mise-env mise-path)]
    (let [jetty-port    (extract-port (get env "MB_JETTY_PORT"))
          frontend-port (extract-port (get env "MB_FRONTEND_DEV_PORT"))
          db-uri        (get env "MB_DB_CONNECTION_URI")
          db-type-str   (get env "MB_DB_TYPE")
          db-type       (when db-type-str (keyword db-type-str))
          db-port       (extract-port db-uri)]
      (when jetty-port
        {:jetty-port    jetty-port
         :frontend-port frontend-port
         :db-type       db-type
         :db-port       db-port}))))

(defn- load-issue-info
  "Read issue.txt and prompt file to get issue ID, URL, and title."
  []
  (let [issue-file (File. ".fixbot/issue.txt")]
    (when (.exists issue-file)
      (let [issue-line (str/trim (slurp issue-file))
            [id url]   (str/split issue-line #"\s*\|\s*" 2)
            ;; Find prompt file to extract title
            fixbot-dir (File. ".fixbot")
            prompt-files (when (.isDirectory fixbot-dir)
                           (->> (.listFiles fixbot-dir)
                                (filter #(str/starts-with? (.getName ^File %) "metabase-fixbot-"))
                                (filter #(str/ends-with? (.getName ^File %) "-prompt.md"))))
            title (when (seq prompt-files)
                    (let [first-line (first (str/split-lines (slurp ^File (first prompt-files))))]
                      ;; Parse "# Fixbot Agent — UXW-3155: Add keyboard shortcut..."
                      (when-let [[_ t] (re-find #":\s*(.+)" first-line)]
                        (str/trim t))))]
        {:id (str/trim (or id ""))
         :url (str/trim (or url ""))
         :title (or title "")}))))

(defn- render-display
  "Render the full status pane display."
  [issue ports be-status fe-status db-status llm-status]
  (let [sb (StringBuilder.)]
    ;; Line 1: Issue title
    (when (and issue (seq (:title issue)))
      (.append sb (:title issue))
      (.append sb "\n"))
    ;; Line 2: Issue ID | URL
    (when issue
      (.append sb (str (:id issue) " | " (:url issue) "\n")))
    ;; Line 3: Metabase | URL | DB
    (when ports
      (let [mb-healthy? (and (= be-status :ready) (= fe-status :ready))
            mb-color    (if mb-healthy? green red)
            mb-text     (str "Metabase | http://localhost:" (:jetty-port ports))
            db-name     (when (:db-type ports)
                          (str/upper-case (name (:db-type ports))))
            db-color    (if (= db-status :ready) green red)
            db-text     (when (and db-name (:db-port ports))
                          (str db-name ": " (:db-port ports)))]
        (.append sb (colorize mb-color mb-text))
        (when db-text
          (.append sb " | ")
          (.append sb (colorize db-color db-text)))
        (.append sb "\n")))
    ;; Blank line + LLM status
    (when (seq llm-status)
      (.append sb "\n")
      (let [waiting? (re-find #"(?i)wait|test|verify|check|confirm|review|feedback|input" llm-status)]
        (.append sb (if waiting? (colorize yellow llm-status) llm-status)))
      (.append sb "\n"))
    (.toString sb)))

(defn run!
  "Watch .fixbot/llm-status.txt and periodically check service health."
  [{:keys [arguments]}]
  (let [file-path (or (first arguments) ".fixbot/llm-status.txt")
        f         (File. ^String file-path)
        mise-path "mise.local.toml"]
    (loop [last-output    ""
           ports          nil
           issue          nil
           last-be-status :unhealthy
           last-fe-status :unhealthy
           last-db-status :unhealthy
           tick           0]
      (let [check?    (zero? (mod tick 5))
            ports     (or ports (when check? (load-ports mise-path)))
            issue     (or issue (when check? (load-issue-info)))
            be-status (if (and check? ports)
                        (check-http (str "http://localhost:" (:jetty-port ports) "/api/health") 2000)
                        last-be-status)
            fe-status (if (and check? ports)
                        (check-http (str "http://localhost:" (:frontend-port ports)) 2000)
                        last-fe-status)
            db-status (if (and check? ports (:db-port ports))
                        (check-tcp "localhost" (:db-port ports) 2000)
                        last-db-status)
            ;; Read LLM status from file
            llm-status (when (.exists f)
                         (str/trim (slurp f)))
            output    (render-display issue ports be-status fe-status db-status llm-status)]
        (when (not= output last-output)
          (print "\033[2J\033[H")
          (print output)
          (flush))
        (Thread/sleep 1000)
        (recur output ports issue be-status fe-status db-status (inc tick))))))
