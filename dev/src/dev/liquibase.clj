(ns dev.liquibase
  (:require [clojure.string :as str]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.db.env :as mdb.env]))

(comment mdb.data-source/keep-me)

(defn -main [& args]
  (let [args (into ["--changeLogFile=resources/migrations/000_migrations.yaml"]
                   (comp cat
                         (filter seq))
                   (let [^metabase.db.data_source.DataSource data-source mdb.env/data-source
                         ^java.util.Properties properties                (.properties data-source)]
                     [(when-let [user (some-> properties (.get "user"))]
                        ["--username" user])
                      (when-let [password (some-> properties (.get "password"))]
                        ["--password" password])
                      ["--url" (.url data-source)]
                      (map str args)]))]
    (println (str/join " " (cons "liquibase" (map pr-str args))))
    (liquibase.integration.commandline.Main/main
     (into-array String args))))
