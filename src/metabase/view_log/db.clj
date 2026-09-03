(ns metabase.view-log.db
  "Application database queries for the view log module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [java-time.api :as t]
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

(defn increment-card-view-counts!
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Cards with `ids`."
  [count->ids]
  (increment-view-counts-of-model! :model/Card count->ids))

(defn increment-dashboard-view-counts!
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Dashboards with `ids`."
  [count->ids]
  (increment-view-counts-of-model! :model/Dashboard count->ids))

(defn increment-table-view-counts!
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Tables with `ids`."
  [count->ids]
  (increment-view-counts-of-model! :model/Table count->ids))

(defn increment-document-view-counts!
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Documents with `ids`."
  [count->ids]
  (increment-view-counts-of-model! :model/Document count->ids))

(defn insert-view-logs!
  "Insert the ViewLog rows `views`."
  [views]
  (t2/insert! :model/ViewLog views))

(defn card-type
  "The `:type` of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :type :model/Card :id card-id))

(defn update-dashboards-last-viewed-at!
  "Move `last_viewed_at` of each Dashboard in `dashboard-id->timestamp` forward to its timestamp, without touching
  `updated_at`, via a raw update that bypasses Toucan 2 model hooks (specifically the :hook/search-index
  after-update; the search index can tolerate staleness on this field, catching up on the next re-index cycle or
  when the dashboard is edited)."
  [dashboard-id->timestamp]
  (t2/query {:update (t2/table-name :model/Dashboard)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    dashboard-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys dashboard-id->timestamp)]}))
