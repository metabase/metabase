(ns metabase-enterprise.content-verification.db
  "Application database queries for the content-verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn instance-exists?
  "Whether an instance of `model` with `id` exists."
  [model id]
  (t2/exists? model id))
