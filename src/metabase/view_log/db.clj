(ns metabase.view-log.db
  "Application database queries for the view log module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.view-log.schema :as view-log.schema]
   [toucan2.core :as t2]))

(mu/defn insert-view-logs!
  "Insert the ViewLog rows `views`, returning the number inserted."
  [views :- [:sequential ::view-log.schema/view-log.create]]
  (t2/with-transaction [_conn]
    (t2/insert! :model/ViewLog views)))

(mu/defn card-type
  "The `:type` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :type :model/Card :id card-id))

(mu/defn view-log-ids-before :- [:sequential ms/PositiveInt]
  "The ids of up to `batch-size` of the ViewLogs whose `time-column` is at or before `cutoff`, lowest first."
  [time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (vec (t2/select-pks-vec :model/ViewLog {:where    [:<= time-column [:auto/param cutoff]]
                                          :order-by [[:id :asc]]
                                          :limit    batch-size})))

(mu/defn delete-view-logs!
  "Delete the ViewLogs with `ids`, returning the number deleted."
  [ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/ViewLog :id [:in ids]))
