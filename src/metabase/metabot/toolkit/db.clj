(ns metabase.metabot.toolkit.db
  "Application database queries for the Metabot toolkit."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn cards :- [:sequential :map]
  "The cards whose ids are in `ids`."
  [ids :- [:set {:min 1} :int]]
  (t2/select :model/Card :id [:in [:auto/param ids]]))

(mu/defn pulses :- [:sequential :map]
  "The pulses whose ids are in `ids`, archived ones included."
  [ids :- [:set {:min 1} :int]]
  (t2/select :model/Pulse :id [:in [:auto/param ids]]))
