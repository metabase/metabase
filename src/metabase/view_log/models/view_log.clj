(ns metabase.view-log.models.view-log
  "The ViewLog is used to log an event where a given User views a given object such as a Table or Card (Question)."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.view-log.db :as view-log.db]
   [metabase.view-log.models.view-log-impl :as view-log-impl]
   [metabase.view-log.schema :as view-log.schema]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(m/defmethod t2/table-name :model/ViewLog [_model] :view_log)

(doto :model/ViewLog
  (derive :metabase/model)
  (derive :hook/worktree-id)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.always-allow))

(mr/def ::context [:maybe view-log-impl/context])

(t2/define-before-insert :model/ViewLog
  [log-entry]
  (let [defaults {:timestamp :%now}]
    (->> log-entry
         (merge defaults)
         analytics/include-sdk-info)))

(t2/deftransforms :model/ViewLog
  {:metadata mi/transform-json
   :context  mi/transform-keyword})

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-view-logs!
  "Insert the ViewLog rows `views` in one transaction, one statement per [[mdb/create-partition-size]] rows."
  [views :- [:sequential ::view-log.schema/view-log.create]]
  (t2/with-transaction [_conn]
    (run! (comp view-log.db/insert-view-logs! vec) (partition-all mdb/create-partition-size views))))

(mu/defn delete-view-logs! :- :nil
  "Delete the ViewLogs with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/ViewLog ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ViewLog [_model]
  {:skip? false})
