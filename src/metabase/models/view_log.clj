(ns metabase.models.view-log
  "The ViewLog is used to log an event where a given User views a given object such as a Table or Card (Question)."
  (:require
   [metabase.analytics.sdk :as sdk]
   [metabase.models.interface :as mi]
   [metabase.models.view-log-impl :as view-log-impl]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(m/defmethod t2/table-name :model/ViewLog [_model] :view_log)

(doto :model/ViewLog
  (derive :metabase/model)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.always-allow))

(mr/def ::context [:maybe view-log-impl/context])

(t2/define-before-insert :model/ViewLog
  [log-entry]
  (when (mu.fn/instrument-ns? *ns*)
    (mu/validate-throw [:map [:context {:optional true} ::context]] log-entry))
  (let [defaults {:timestamp :%now}]
    (->> log-entry
         (merge defaults)
         sdk/include-analytics)))

(t2/deftransforms :model/ViewLog
  {:metadata mi/transform-json
   :context  mi/transform-keyword})
