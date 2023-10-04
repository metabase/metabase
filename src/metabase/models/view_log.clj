(ns metabase.models.view-log
  "The ViewLog is used to log an event where a given User views a given object such as a Table or Card (Question)."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ViewLog
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/ViewLog)

(methodical/defmethod t2/table-name :model/ViewLog [_model] :view_log)

(doto ViewLog
  (derive :metabase/model)
  (derive ::mi/read-policy.always-allow)
  (derive ::mi/write-policy.always-allow))

(t2/define-before-insert :model/ViewLog
  [log-entry]
  (let [defaults {:timestamp :%now}]
    (merge defaults log-entry)))

(t2/deftransforms :model/ViewLog
  {:metadata mi/transform-json})
