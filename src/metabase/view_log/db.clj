(ns metabase.view-log.db
  "Application database queries for the view log module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [java-time.api :as t]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.view-log.schema :as view-log.schema]
   [toucan2.core :as t2]))

(defn- increment-view-counts-of-model!
  "Increments `model`'s `view_count` per `count->ids`, via a raw update that bypasses Toucan 2 model hooks
  (specifically the search-index enqueue on after-update)."
  [model count->ids]
  (t2/query {:update (t2/table-name model)
             :set    {:view_count [:+ :view_count (into [:case]
                                                        (mapcat (fn [[cnt ids]]
                                                                  [[:in :id ids] cnt])
                                                                count->ids))]}
             :where  [:in :id (apply concat (vals count->ids))]}))

(def ^:private count->ids-schema
  [:map-of ms/PositiveInt [:sequential ms/PositiveInt]])

(mu/defn increment-card-view-counts! :- [:sequential :int]
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Cards with `ids`."
  [count->ids :- count->ids-schema]
  (increment-view-counts-of-model! :model/Card count->ids))

(mu/defn increment-dashboard-view-counts! :- [:sequential :int]
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Dashboards with `ids`."
  [count->ids :- count->ids-schema]
  (increment-view-counts-of-model! :model/Dashboard count->ids))

(mu/defn increment-table-view-counts! :- [:sequential :int]
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Tables with `ids`."
  [count->ids :- count->ids-schema]
  (increment-view-counts-of-model! :model/Table count->ids))

(mu/defn increment-document-view-counts! :- [:sequential :int]
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Documents with `ids`."
  [count->ids :- count->ids-schema]
  (increment-view-counts-of-model! :model/Document count->ids))

(mu/defn insert-view-logs! :- :int
  "Insert the ViewLog rows `views`, returning the number inserted."
  [views :- [:sequential ::view-log.schema/view-log.update]]
  (t2/insert! :model/ViewLog views))

(mu/defn card-type :- [:maybe :keyword]
  "The `:type` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :type :model/Card :id card-id))

(mu/defn update-dashboards-last-viewed-at! :- [:sequential :int]
  "Move `last_viewed_at` of each Dashboard in `dashboard-id->timestamp` forward to its timestamp, without touching
  `updated_at`, via a raw update that bypasses Toucan 2 model hooks (specifically the :hook/search-index
  after-update; the search index can tolerate staleness on this field, catching up on the next re-index cycle or
  when the dashboard is edited)."
  [dashboard-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  (t2/query {:update (t2/table-name :model/Dashboard)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    dashboard-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys dashboard-id->timestamp)]}))
