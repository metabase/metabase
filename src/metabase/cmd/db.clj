(ns metabase.cmd.db
  "Application database queries for the command-line module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn user-id-and-active-by-email
  "The `:id` and `:is_active` of the User whose email matches `email` case-insensitively, or nil."
  [email]
  (t2/select-one [:model/User :id :is_active] :%lower.email (u/lower-case-en email)))
