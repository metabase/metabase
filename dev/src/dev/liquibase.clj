(ns dev.liquibase
  (:require
   [clojure.string :as str]
   [colorize.core :as colorize]
   [metabase.db]
   [metabase.db.data-source]
   [metabase.db.env :as mdb.env]))

(set! *warn-on-reflection* true)

(comment metabase.db.data-source/keep-me)

(defn -main
  "Use the Liquibase CLI with `clojure -M:liquibase <command>`."
  [& args]
  (let [args (if (empty? args)
               ["help"]
               args)
        args (into ["--changeLogFile=resources/liquibase_legacy.yaml"]
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
    ;; when generating documentation we need to set up the DB and run migrations.
    (when (= (first args) "dbDoc")
      (metabase.db/setup-db! {:create-sample-content? false}))
    (println (colorize/green (str/join " " (cons "liquibase" (map pr-str args)))))
    ;; use reflection here instead of static method calls because `liquibase.integration.commandline.Main` fails to load
    ;; without having the `logback` dependency available. We add this as `:extra-deps` for the `:liquibase` profile. We
    ;; don't want other stuff like the linters to choke here tho.
    (let [klass  (Class/forName "liquibase.integration.commandline.Main")
          method (.getMethod klass "main" (into-array Class [(Class/forName "[Ljava.lang.String;")]))]
      (.invoke method klass ^"[Ljava.lang.Object" (into-array Object [(into-array String args)])))))
