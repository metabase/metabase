(ns dev.h2-shell
  (:require [environ.core :as env]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.db.env :as mdb.env]))

(comment mdb.data-source/keep-me)

(defn shell
  "Open an H2 shell with `clojure -X:h2`."
  [& _args]
  ;; Force the DB to use h2 regardless of what's actually in the env vars for Java properties
  (alter-var-root #'env/env assoc :mb-db-type "h2")
  (require 'metabase.db.env :reload)
  (org.h2.tools.Shell/main
   (into-array
    String
    ["-url" (let [^metabase.db.data_source.DataSource data-source mdb.env/data-source
                  url                                             (.url data-source)]
              (println "Connecting to database at URL" url)
              url)])))
