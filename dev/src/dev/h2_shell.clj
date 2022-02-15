(ns dev.h2-shell
  (:require [metabase.db.data-source :as mdb.data-source]
            [metabase.db.env :as mdb.env]))

(comment mdb.data-source/keep-me)

(defn shell
  "Open an H2 shell with `clojure -X:h2`."
  [& _args]
  (org.h2.tools.Shell/main
   (into-array
    String
    ["-url" (let [^metabase.db.data_source.DataSource data-source mdb.env/data-source]
              (.url data-source))])))
