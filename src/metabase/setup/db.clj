(ns metabase.setup.db
  "Application database queries for the setup module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn users-except :- [:sequential (ms/InstanceOf :model/User)]
  "Every User other than the one with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/select :model/User {:where [:not= :id user-id]}))
