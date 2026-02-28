(ns dev.h2
  (:require
   [clojure.tools.cli :as cli]
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
  "Starts a TCP server for the H2 app-db database on the specified port."
  [port]
  (when-not (= "h2" (:mb-db-type env/env))
    (throw (ex-info "The database type is not H2" {:db-type (:mb-db-type env/env)})))
  (when-let [listener @tcp-listener]
    (throw (ex-info "TCP listener is already running" {:port (:port listener)})))
  (let [server (.start (Server/createTcpServer (into-array ["-tcp" "-tcpAllowOthers" "-tcpPort" (str port)])))]
    (reset! tcp-listener {:server server :port port})
    (println (str "H2 TCP server started (no username or password): jdbc:h2:tcp://localhost:" port "/"
                  (#'metabase.app-db.env/env->db-file metabase.app-db.env/env)))))

(defn connect-tcp
  "Open an H2 shell connected to a TCP listener."
  [{:keys [port db-file]}]
  (let [url (str "jdbc:h2:tcp://localhost:" port "/" db-file)]
    (println "Connecting to database at URL" url)
    (org.h2.tools.Shell/main (into-array String ["-url" url]))))

(def ^:private connect-cli-spec
  [["-h" "--help" "Show this help text"]
   ["-p" "--port PORT" "H2 TCP listener port"
    :parse-fn #(Integer/parseInt %)]
   ["-f" "--db-file PATH" "H2 database file path"]])

(defn -main
  "CLI entry point for connecting to an H2 TCP listener."
  [& args]
  (let [{:keys [options errors summary]} (cli/parse-opts args connect-cli-spec)
        {:keys [help port db-file]} options]
    (when help
      #_:clj-kondo/ignore
      (do
        (println "Usage: clojure -M:connect-to-h2-tcp --port PORT --db-file PATH")
        (println "Options:")
        (println summary))
      (System/exit 0))
    (when (seq errors)
      #_:clj-kondo/ignore
      (doseq [error errors]
        (println error))
      (System/exit 1))
    (when-not (and port db-file)
      #_:clj-kondo/ignore
      (do
        (println "Both --port and --db-file are required.")
        (println "Usage: clojure -M:connect-to-h2-tcp --port PORT --db-file PATH"))
      (System/exit 1))
    (connect-tcp {:port port :db-file db-file})))
