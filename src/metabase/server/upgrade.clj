(ns metabase.server.upgrade
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  (:import
   (java.lang ProcessHandle)))

(defn- docker-check []
  (when (re-find #"docker" (slurp "/proc/1/cgroup"))
    (throw (ex-info "Automatic upgrade not supported in docker" {:status-code 400}))))

(def ^:private latest-jar-url "https://downloads.metabase.com/latest/metabase.jar")

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
        temp-jar-path (temp-jar-path-for jar-path)]
    (log/info "Initiating automatic upgrade...")
    (let [response (http/get latest-jar-url {:as :stream})]
      (io/copy (:body response) (io/file temp-jar-path)))
    (log/info "Download complete.")
    (spit (instructions-path jar-path) (instructions-for jar-path new-jar-path))
    (.renameTo (io/file jar-path) (io/file new-jar-path))
    (.renameTo (io/file temp-jar-path) (io/file jar-path))
    (exit-soon)
    (respond {:status-code 200 :body {:status "Upgraded, restarting"}})))
