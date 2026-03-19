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

(defn- status-label [status]
  (case status
    :ready     "\033[32mready\033[0m"
    :unhealthy "\033[31mUNHEALTHY\033[0m"
    :waiting   "\033[33mwaiting\033[0m"
    "???"))

(defn- check-services
  "Check health of backend, frontend, and database. Returns a status string line."
  [jetty-port frontend-port db-type db-port]
  (let [backend  (when jetty-port
                   (check-http (str "http://localhost:" jetty-port "/api/health") 2000))
        frontend (when frontend-port
                   (check-http (str "http://localhost:" frontend-port) 2000))
        db       (when db-port
                   (check-tcp "localhost" db-port 2000))]
    (str "BE:" (if backend (status-label backend) "?")
         "  FE:" (if frontend (status-label frontend) "?")
         (when db
           (str "  " (str/upper-case (name db-type)) ":" (status-label db))))))

(defn run!
  "Watch .fixbot/status.txt and periodically check service health."
  [{:keys [arguments]}]
  (let [file-path    (or (first arguments) ".fixbot/status.txt")
        f            (File. ^String file-path)
        mise-path    "mise.local.toml"
        env          (parse-mise-env mise-path)
        jetty-port   (extract-port (get env "MB_JETTY_PORT"))
        frontend-port (extract-port (get env "MB_FRONTEND_DEV_PORT"))
        db-uri       (get env "MB_DB_CONNECTION_URI")
        db-type-str  (get env "MB_DB_TYPE")
        db-type      (when db-type-str (keyword db-type-str))
        db-port      (extract-port db-uri)]
    (loop [last-modified  0
           last-services  ""
           tick           0]
      (let [check?          (zero? (mod tick 5)) ;; check services every 5 seconds
            current-modified (.lastModified f)
            services        (if check?
                              (check-services jetty-port frontend-port db-type db-port)
                              last-services)
            changed?        (or (not= current-modified last-modified)
                                (not= services last-services))]
        (when changed?
          (print "\033[2J\033[H")
          (flush)
          (when (.exists f)
            (print (slurp f)))
          (println)
          (println services)
          (flush))
        (Thread/sleep 1000)
        (recur current-modified services (inc tick))))))
