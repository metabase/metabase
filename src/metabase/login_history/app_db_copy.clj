(ns metabase.login-history.app-db-copy
  "How copying the application database to another database copies login history.")

(set! *warn-on-reflection* true)

(defn transform-login-history
  "The login history row to write, without `session_id`, since sessions are not copied and one deleted while dumping
  could leave a dangling reference (UXW-5258)."
  [row _opts]
  (dissoc row :session_id))
