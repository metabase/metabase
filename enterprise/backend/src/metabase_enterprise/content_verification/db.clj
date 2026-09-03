(ns metabase-enterprise.content-verification.db
  "Application database queries for the content-verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn card-exists?
  "Whether a Card with `id` exists."
  [id]
  (t2/exists? :model/Card id))

(defn dashboard-exists?
  "Whether a Dashboard with `id` exists."
  [id]
  (t2/exists? :model/Dashboard id))
