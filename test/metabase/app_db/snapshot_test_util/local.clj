(ns metabase.app-db.snapshot-test-util.local
  "Dumps the configured migration test database with locally available clients."
  (:require
   [babashka.fs :as fs]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.h2 :as snapshot.h2]
   [metabase.app-db.snapshot-test-util.mysql :as snapshot.mysql]
   [metabase.app-db.snapshot-test-util.postgres :as snapshot.postgres]))

(set! *warn-on-reflection* true)

(defn- client [flavor]
  (case flavor
    :postgres "pg_dump"
    :mysql "mysqldump"
    (:mariadb :mariadb-legacy-timestamp) "mariadb-dump"))

(defn- run-client! [flavor details executable & args]
  (let [env (assoc (into {} (System/getenv))
                   (if (= flavor :postgres) "PGPASSWORD" "MYSQL_PWD") (or (:password details) ""))
        {:keys [exit out err]} (apply shell/sh (str executable) (concat args [:env env]))]
    (when-not (zero? exit)
      (throw (ex-info "Snapshot dump client failed" {:flavor flavor, :exit exit, :error err})))
    out))

(defn dump!
  "Return SQL for the database behind `conn`, using the selected local dump options."
  [{:keys [dumper flavor details executable]} ^java.sql.Connection conn]
  (let [server {:details (assoc details
                                :db (.getCatalog conn)
                                :user (or (:user details) (.getUserName (.getMetaData conn))))
                :dump-details (select-keys details [:host :port])
                :exec! (fn [_client & args]
                         (apply run-client! flavor details executable args))}]
    (str (str/join (str ";\n" snapshot/statement-separator "\n")
                   (dump/dump-statements dumper server conn))
         ";\n")))

(defn dump-options
  "Return local dump options, or nil if the required dump client is unavailable."
  [flavor details]
  (let [executable (when (and (not= flavor :h2) details)
                     (fs/which (client flavor)))]
    (when (or (= flavor :h2) executable)
      (let [dumper (case flavor
                     :h2 snapshot.h2/dumper
                     :postgres snapshot.postgres/dumper
                     (snapshot.mysql/dumper flavor))]
        {:dumper dumper, :flavor flavor, :details details, :executable executable}))))
