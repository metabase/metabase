(ns metabase.test-setup
  "Functions that run before + after unit tests (setup DB, start web server, load test data)."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [handler :as handler]
             [plugins :as plugins]
             [server :as server]
             [task :as task]
             [util :as u]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.setting :as setting]
            [metabase.plugins.initialize :as plugins.init]
            [metabase.test.data.env :as tx.env]
            [yaml.core :as yaml]))

;;; ------------------------------- Functions That Get Ran On Test Suite Start / Stop --------------------------------

(defn- driver-plugin-manifest [driver]
  (let [manifest (io/file (format "modules/drivers/%s/resources/metabase-plugin.yaml" (name driver)))]
    (when (.exists manifest)
      (yaml/parse-string (slurp manifest)))))

(defn- driver-parents [driver]
  (let [parents-file (io/file (format "modules/drivers/%s/parents" (name driver)))]
    (when (.exists parents-file)
      (str/split-lines (slurp parents-file)))))

(defn- load-plugin-manifests!
  "When running tests driver plugins aren't loaded the normal way -- instead, to keep things sane, we simply merge their
  dependencies and source paths into the Metabase core project via a custom Leiningen plugin. We still need to run
  appropriate plugin initialization code, however, in order to ensure the drivers do things like register proxy
  drivers or get methods for `connection-properties`.

  Work some magic and find manifest files and load them the way the plugins namespace would have done."
  ([]
   (load-plugin-manifests! tx.env/test-drivers))
  ([drivers]
   (doseq [driver drivers
           :let   [info (driver-plugin-manifest driver)]
           :when  info]
     (println (u/format-color 'green "Loading plugin manifest for driver as if it were a real plugin: %s" driver))
     (plugins.init/init-plugin-with-info! info)
     ;; ok, now we need to make sure we load any depenencies for those drivers as well (!)
     (load-plugin-manifests! (driver-parents driver)))))

(defn test-startup
  {:expectations-options :before-run}
  []
  ;; We can shave about a second from unit test launch time by doing the various setup stages in on different threads
  (let [start-web-server!
        (future
          (try
            (server/start-web-server! handler/app)
            (catch Throwable e
              (log/error e "Web server failed to start")
              (System/exit -2))))]
    (try
      (log/info (format "Setting up %s test DB and running migrations..." (name (mdb/db-type))))
      (mdb/setup-db!)

      (plugins/load-plugins!)
      (load-plugin-manifests!)
      ;; we don't want to actually start the task scheduler (we don't want sync or other stuff happening in the BG
      ;; while running tests), but we still need to make sure it sets itself up properly so tasks can get scheduled
      ;; without throwing Exceptions
      (#'task/set-jdbc-backend-properties!)
      (setting/set! :site-name "Metabase Test")
      (init-status/set-complete!)

      ;; If test setup fails exit right away
      (catch Throwable e
        (log/error (u/format-color 'red "Test setup failed: %s\n%s" e (u/pprint-to-str (vec (.getStackTrace e)))))
        (System/exit -1)))

    (u/deref-with-timeout start-web-server! 10000)
    nil))

(defn test-teardown
  {:expectations-options :after-run}
  []
  (log/info "Shutting down Metabase unit test runner")
  (server/stop-web-server!))

(defn call-with-test-scaffolding
  "Runs `test-startup` and ensures `test-teardown` is always called. This function is useful for running a test (or test
  namespace) at the repl with the appropriate environment setup for the test to pass."
  [f]
  (try
    (test-startup)
    (f)
    (catch Exception e
      (throw e))
    (finally
      (test-teardown))))
