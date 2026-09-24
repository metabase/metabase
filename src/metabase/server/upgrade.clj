(ns metabase.server.upgrade
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.api.common :as api]
   [metabase.util.log :as log])
  (:import
   (java.io InputStream OutputStream)
   (java.lang ProcessHandle)))

(defn- docker-check []
  (try
    ;; this isn't a real file so trying to read it with java io file fails
    (when (re-find #"docker" (:out (shell/sh "cat" "/proc/1/cgroup")))
      (throw (ex-info "Automatic upgrade not supported in docker" {:status-code 400})))
    (catch Exception _)))

(def ^:private latest-jar-url
  ;; allow it to be pointed to a local URL for faster testing
  (or (System/getenv "MB_UPGRADE_JAR_URL")
      ;; "http://localhost:3000/metabase.jar"
      "https://downloads.metabase.com/latest/metabase.jar"))

(set! *warn-on-reflection* true)

(defn- current-jar-path []
  (let [cli (-> (ProcessHandle/current) .info .commandLine .get)]
    (or (second (re-find #"-jar +([^ ]+)" cli))
        (throw (ex-info "Could not determine current jar path" {:status-code 400})))))

(defn- jar-path-for [jar-path suffix]
  (let [[_ base] (re-find #"(.*)\.jar" jar-path)]
    (str base "-" suffix ".jar")))

(defn- instructions-path [jar-path]
  (let [[_ base] (re-find #"(.*)\.jar" jar-path)]
    (str base "-RECOVERY-README.txt")))

(defn- instructions-for [jar-path new-jar-path]
  (format "Your Metabase install is being upgraded!
If the automated upgrade goes wrong, you can roll back to the previous version
by moving %s to %s and restarting." new-jar-path jar-path))

(defn- exit-soon []
  (future ; save-lisp-and-die
    (log/info "Exiting in order to restart to new version.")
    (Thread/sleep 100)
    (System/exit 0)))

(def ^:private progress (atom {:status :not-upgrading :current 0}))

;; based on clojure.java.io/copy but with status reporting and slowdown
(defn- copy [^InputStream input ^OutputStream output delay-factor]
  (let [buffer-size (* 1024 1024) ; 1 megabyte buffer
        buffer (make-array Byte/TYPE buffer-size)]
    (loop []
      (let [size (.read input buffer)]
        (swap! progress update :current + size)
        ;; If we do a download from the live jar, it will take too long during
        ;; the demo. If we point it at a local URL, it will be too fast for
        ;; anyone to see the progress bar. Let's shoot for making it take 10s.
        (when delay-factor
          (Thread/sleep delay-factor))
        (when (pos? size)
          (do (.write output buffer 0 size)
              (recur)))))))

(def ^:private headers {"Content-type" "application/json"})

(defn handler
  "Automatic upgrade handler.
  * Write recovery instructions.
  * Move current jar out of the way.
  * Download new jar into old path.
  * Exit (and hope the supervisor handles restarting)."
  [_request respond _raise]
  (docker-check) ; later we'll support cloud deploys using a different method
  (comment
    ;; leave this out for now to make it easier to test with curl
    (api/check-superuser))
  (let [jar-path (current-jar-path)
        prev-jar-path (jar-path-for jar-path "prev")
        temp-jar-path (jar-path-for jar-path "temp")
        instructions (instructions-for jar-path prev-jar-path)]
    (log/info "Initiating automatic upgrade...")
    (swap! progress assoc :status :upgrading)
    (let [response (http/get latest-jar-url {:as :stream})
          total (parse-long (-> response :headers (get "Content-Length")))]
      (swap! progress assoc :total total :current 0)
      (with-open [out (io/output-stream temp-jar-path)]
        (copy (:body response) out (some-> (System/getenv "MB_UPGRADE_SLOW")
                                           parse-long))))
    (swap! progress assoc :status :downloaded)
    (log/info "Download complete.")
    (log/info (prn-str @progress))
    (spit (io/file (instructions-path jar-path)) instructions)
    (.renameTo (io/file jar-path) (io/file prev-jar-path))
    (.renameTo (io/file temp-jar-path) (io/file jar-path))
    (exit-soon)
    (respond {:status-code 200 :headers headers
              :body {:status "Upgraded, restarting"
                     :instructions instructions}})))

(defn health
  "Return the status of the in-progress upgrade."
  [_request respond _raise]
  (respond {:status 200 :body @progress :headers headers}))

(defn rollback
  "Roll back to the previous version."
  [_request respond _raise]
  (log/info "Rolling back...")
  (let [jar-path (current-jar-path)
        rollback-jar-path (jar-path-for jar-path "rollback")
        prev-jar-path (jar-path-for jar-path "prev")]
    (when-not (.exists (io/file prev-jar-path))
      (throw (ex-info "Can't roll back; previous jar not found"
                      {:status-code 404})))
    (.renameTo (io/file jar-path) (io/file rollback-jar-path))
    (.renameTo (io/file prev-jar-path) (io/file jar-path))
    (log/info "Moving jars" {:jar-path jar-path
                             :rollback-jar-path rollback-jar-path
                             :prev-jar-path prev-jar-path})
    (exit-soon)
    (respond {:status-code 200 :headers headers
              :body {:status "Rolled back; restarting"}})))

(defn rollback-available?
  "Should the frontend show the rollback button?"
  [_request respond _raise]
  (let [jar-path (current-jar-path)
        prev-jar-path (jar-path-for jar-path "prev")]
    (respond (if (.exists (io/file prev-jar-path))
               {:status 200 :body {:status "OK"} :headers headers}
               {:status 404 :body {:status "no rollback"} :headers headers}))))

;;; manual test steps:

;; * cd target/uberjar && python3 -m http.server 3000 # in a separate tab
;; * bin/build.sh '{:version "0.63.0"}'
;; * mv target/uberjar/metabase.jar target/uberjar/metabase-current.jar
;; * bin/build.sh '{:version "0.65.0"}'
;; * ./supervisor.sh # in a separate tab
;; * curl http://localhost:8088/api/docs/openapi.json | jq .info
;; * curl -XPOST http://localhost:8088/api/upgrade
;; * curl http://localhost:8088/api/upgrade/health # while it's running
;; * [wait for it to restart...]
;; * curl http://localhost:8088/api/docs/openapi.json | jq .info

;;; testing rollback

;; * ls -l target/uberjar
;; * curl http://localhost:8088/api/docs/openapi.json | jq .info
;; * curl -I http://localhost:8088/api/upgrade/rollback
;; * curl -XPOST http://localhost:8088/api/upgrade/rollback
;; * [wait for it to restart...]
;; * curl http://localhost:8088/api/docs/openapi.json | jq .info

;;; supervisor.sh:

;; #!/bin/bash
;; export MB_UPGRADE_SLOW=y
;; export MB_UPGRADE_JAR_URL=http://localhost:3000/metabase.jar
;; export MB_JETTY_PORT=8088
;; java -jar target/uberjar/metabase-current.jar
;; sleep 2 # give the user a chance to ctrl-c out of it
;; exec $0
