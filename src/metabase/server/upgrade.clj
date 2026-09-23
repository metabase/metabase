(ns metabase.server.upgrade
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  (:import
   (java.io InputStream OutputStream)
   (java.lang ProcessHandle)))

(defn- docker-check []
  (try
    (when (re-find #"docker" (slurp "/proc/1/cgroup")) ; TODO
      (throw (ex-info "Automatic upgrade not supported in docker" {:status-code 400})))
    (catch Exception _)))

(def ^:private latest-jar-url
  ;; allow it to be pointed to a local URL for faster testing
  (or (System/getenv "MB_UPGRADE_JAR_URL")
      ;; "http://localhost:3000/metabase.jar"
      "https://downloads.metabase.com/latest/metabase.jar"))

(set! *warn-on-reflection* true)

(defn- current-jar-path [cli]
  (or (second (re-find #"-jar +([^ ]+)" cli))
      (throw (ex-info "Could not determine current jar path" {:status-code 400}))))

(defn- new-jar-path-for [jar-path]
  (let [[_ base] (re-find #"(.*)\.jar" jar-path)]
    (str base "-" (:tag config/mb-version-info) ".jar")))

(defn- temp-jar-path-for [jar-path]
  (let [[_ base] (re-find #"(.*)\.jar" jar-path)]
    (str base "-temp.jar")))

(defn- instructions-path [jar-path]
  (let [[_ base] (re-find #"(.*)\.jar" jar-path)]
    (str base "-RECOVERY-README.txt")))

(defn- instructions-for [jar-path new-jar-path]
  (format "Your Metabase install is being upgraded!
If the automated upgrade goes wrong, you can roll back to the previous version
by moving %s to %s and restarting." new-jar-path jar-path))

(defn- exit-soon []
  (future
    (log/info "Exiting in order to restart to new version.")
    (Thread/sleep 100)
    (System/exit 0)))

(def ^:private progress (atom {:status :not-upgrading}))

(defn- copy [^InputStream input ^OutputStream output]
  (let [buffer-size 1024
        buffer (make-array Byte/TYPE buffer-size)]
    (loop []
      (let [size (.read input buffer)]
        (swap! progress :current + size)
        (when (pos? size)
          (do (.write output buffer 0 size)
              (recur)))))))

;; TODO: admins only

(def ^:private headers {"Content-type" "application/json"})

(defn handler
  "Automatic upgrade handler.
  * Write recovery instructions.
  * Move current jar out of the way.
  * Download new jar into old path.
  * Exit (and hope the supervisor handles restarting)."
  [_request respond _raise]
  (docker-check) ; later we'll support cloud deploys using a different method
  (let [cli (-> (ProcessHandle/current) .info .commandLine .get)
        jar-path (current-jar-path cli)
        new-jar-path (new-jar-path-for jar-path)
        temp-jar-path (temp-jar-path-for jar-path)
        instructions (instructions-for jar-path new-jar-path)]
    (log/info "Initiating automatic upgrade...")
    (swap! progress assoc :status :upgrading)
    (let [response (http/get latest-jar-url {:as :stream})
          total (parse-long (-> response :headers (get "Content-Length")))]
      (swap! progress assoc :total total :current 0)
      (io/copy (:body response) (io/output-stream temp-jar-path)))
    (swap! progress assoc :status :downloaded)
    (log/info "Download complete.")
    (spit (io/file (instructions-path jar-path)) instructions)
    (.renameTo (io/file jar-path) (io/file new-jar-path))
    (.renameTo (io/file temp-jar-path) (io/file jar-path))
    (exit-soon)
    (respond {:status-code 200 :headers headers
              :body {:status "Upgraded, restarting"
                     :instructions instructions}})))

(defn health
  "Return the status of the in-progress upgrade."
  [_request respond _raise]
  (respond {:status 200 :body @progress :headers headers}))

;; manual test:

;; * python3 -m http.server 3000
;; * bin/build.sh
;; * ./supervisor.sh
;; * curl -XPOST http://localhost:8088/api/upgrade
