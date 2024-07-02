(ns metabase.cmd.migrate
  (:require
   [metabase.db :as mdb]))

(defn migrate!
  "Migrate the Metabase application DB."
  [direction]
  (mdb/migrate! (mdb/data-source) (keyword direction)))
