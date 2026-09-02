(ns metabase.cmd.db
  "Application database queries for the command-line module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn user-id-and-active-by-email
  "The `:id` and `:is_active` of the User whose lower-cased email is `lower-case-email`, or nil."
  [lower-case-email]
  (t2/select-one [:model/User :id :is_active] :%lower.email lower-case-email))
