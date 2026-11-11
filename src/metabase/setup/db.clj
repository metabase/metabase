(ns metabase.setup.db
  "Application database queries for the setup module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]))

(mu/defn users-except
  "Every User other than the one with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/User {:where [:not= :id user-id]}))
