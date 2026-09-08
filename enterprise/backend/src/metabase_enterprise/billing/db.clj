(ns metabase-enterprise.billing.db
  "Application database queries for the billing module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-personal-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active personal Users."
  []
  (t2/count :model/User :is_active true :type :personal))

(mu/defn user-email :- [:maybe :string]
  "The email of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :email :model/User :id user-id))
