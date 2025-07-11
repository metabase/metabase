(ns dev.h2
  (:require
   [environ.core :as env]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.env :as mdb.env])
  (:import (org.h2.tools Server)))

(comment mdb.data-source/keep-me)

(defn shell
  "Open an H2 shell with `clojure -X:h2`."
  [& _args]
  ;; Force the DB to use h2 regardless of what's actually in the env vars for Java properties
  (alter-var-root #'env/env assoc :mb-db-type "h2")
  (require 'metabase.app-db.env :reload)
  (org.h2.tools.Shell/main
   (into-array
    String
    ["-url" (let [^metabase.app_db.data_source.DataSource data-source mdb.env/data-source
                  url                                             (.url data-source)]
              (println "Connecting to database at URL" url)
              url)])))

(def ^:private tcp-listener (atom nil))

(defn tcp-listen
  "Starts a TCP server for the H2 app-db database on port 9092."
  []
  (when @tcp-listener
    (throw (ex-info "TCP listener is already running" {:port 9092})))
  (reset! tcp-listener (.start (Server/createTcpServer (into-array ["-tcp" "-tcpAllowOthers" "-tcpPort" "9092"]))))
  (println (str "H2 TCP server started (no username or password): jdbc:h2:tcp://localhost:9092/" (#'metabase.app-db.env/env->db-file metabase.app-db.env/env))))
