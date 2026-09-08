(ns metabase-enterprise.content-verification.db
  "Application database queries for the content-verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn card-exists? :- :boolean
  "Whether a Card with `id` exists."
  [id :- ::lib.schema.id/card]
  (t2/exists? :model/Card id))

(mu/defn dashboard-exists? :- :boolean
  "Whether a Dashboard with `id` exists."
  [id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Dashboard id))
