(ns metabase.cmd.db
  "Application database queries for the command-line module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn user-id-and-active-by-email :- [:maybe (mut/select-keys ::users.schema/user [:id :is_active])]
  "The `:id` and `:is_active` of the User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (t2/select-one [:model/User :id :is_active] :%lower.email (u/lower-case-en email)))
