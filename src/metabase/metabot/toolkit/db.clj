(ns metabase.metabot.toolkit.db
  "Application database queries for the Metabot toolkit."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn cards :- [:sequential :map]
  "The cards whose ids are in `ids`."
  [ids :- [:set {:min 1} :int]]
  (t2/select :model/Card :id [:in [:auto/param ids]]))

(mu/defn dashboard :- [:maybe :map]
  "The dashboard with `id`, or nil."
  [id :- pos-int?]
  (t2/select-one :model/Dashboard :id [:auto/param id]))
