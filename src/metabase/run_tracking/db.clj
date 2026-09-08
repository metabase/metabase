(ns metabase.run-tracking.db
  "Application database queries for the run tracking module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn heartbeat! :- [:sequential :int]
  "Set `heartbeat-column` to now on the `model` rows in `ids` matching the Honey SQL predicate `active`, returning
  the number updated."
  [model            :- :keyword
   active           :- vector?
   heartbeat-column :- :keyword
   ids              :- [:sequential ms/PositiveInt]]
  (t2/query {:update (t2/table-name model)
             :set    {heartbeat-column :%now}
             :where  [:and active [:in :id ids]]}))

(mu/defn active-ids :- [:maybe [:set ms/PositiveInt]]
  "The ids among `ids` of the `model` rows matching the Honey SQL predicate `active`."
  [model  :- :keyword
   active :- vector?
   ids    :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :id model {:where [:and [:in :id ids] active]}))

(mu/defn lock-active-stale-rows :- [:sequential :map]
  "The `model` rows matching the Honey SQL predicates `active` and `stale`, locked for update."
  [model  :- :keyword
   active :- vector?
   stale  :- vector?]
  (t2/select model {:where [:and active stale] :for :update}))

(mu/defn set-terminal! :- [:sequential :int]
  "Apply the `terminal` column values to the `model` rows in `ids` matching the Honey SQL predicate `active`,
  returning the number updated."
  [model    :- :keyword
   active   :- vector?
   ids      :- [:sequential ms/PositiveInt]
   terminal :- :map]
  (t2/query {:update (t2/table-name model)
             :set    terminal
             :where  [:and active [:in :id ids]]}))
