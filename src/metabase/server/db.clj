(ns metabase.server.db
  "Application database queries for the server module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-info
  "The single row of the compiled `sql` run with `params`, or nil."
  [sql params]
  (t2/query-one (cons sql params)))

(defn touch-session!
  "Set `last_active_at` of the Session with `key-hashed` to now."
  [key-hashed]
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:last_active_at :%now}
                 :where  [:= :key_hashed key-hashed]}))
