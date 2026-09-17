(ns metabase-enterprise.gsheets.db
  "Application database queries for the gsheets module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn setting
  "The Setting with `setting-key`, or nil."
  [setting-key :- :string]
  (t2/select-one :model/Setting :key setting-key))
