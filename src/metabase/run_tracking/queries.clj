(ns metabase.run-tracking.queries
  "Application database queries for the run tracking module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn heartbeat!
  "Set `heartbeat-column` to now on the `model` rows in `ids` matching the Honey SQL predicate `active`."
  [model active heartbeat-column ids]
  (t2/query {:update (t2/table-name model)
             :set    {heartbeat-column :%now}
             :where  [:and active [:in :id ids]]}))

(defn active-ids
  "The ids among `ids` of the `model` rows matching the Honey SQL predicate `active`."
  [model active ids]
  (t2/select-fn-set :id model {:where [:and [:in :id ids] active]}))

(defn lock-active-stale-rows
  "The `model` rows matching the Honey SQL predicates `active` and `stale`, locked for update."
  [model active stale]
  (t2/select model {:where [:and active stale] :for :update}))

(defn set-terminal!
  "Apply the `terminal` column values to the `model` rows in `ids` matching the Honey SQL predicate `active`."
  [model active ids terminal]
  (t2/query {:update (t2/table-name model)
             :set    terminal
             :where  [:and active [:in :id ids]]}))
