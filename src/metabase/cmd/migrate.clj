(ns metabase.cmd.migrate
  (:require
   [metabase.db :as mdb]
   [metabase.db.setup :as mdb.setup]))

(defn migrate!
  "Migrate the Metabase application DB."
  [direction]
  (mdb.setup/migrate! (mdb/db-type) (mdb/data-source) (keyword direction)))
