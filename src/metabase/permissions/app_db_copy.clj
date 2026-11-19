(ns metabase.permissions.app-db-copy
  "How copying the application database to another database copies data permissions.")

(set! *warn-on-reflection* true)

(defn transform-data-permissions
  "The data permissions row to write, without `unique_perms_helper`, a generated column."
  [row _opts]
  (dissoc row :unique_perms_helper))
