(ns metabase.cmd.migrate
  (:require
   [metabase.app-db.core :as mdb]))

(defn migrate!
  "Migrate the Metabase application DB."
  [direction]
  ;; Migrations ask whether this is MariaDB while Liquibase holds a connection. Asking first spares them a second
  ;; checkout.
  (mdb/mariadb?)
  (mdb/migrate! (mdb/data-source) (keyword direction)))
