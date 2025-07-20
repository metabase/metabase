(ns metabase.cmd.migrate
  (:require
   [metabase.app-db.core :as mdb]))

(defn migrate!
  "Migrate the Metabase application DB."
  [direction]
  (mdb/migrate! (mdb/data-source) (keyword direction)))
