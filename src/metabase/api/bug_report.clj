(ns metabase.api.bug-report
  "/api/task endpoints"
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.troubleshooting :as troubleshooting]))

(api/defendpoint GET "/"
  "Return all info useful for a bug report"
  []
  {:system-info (troubleshooting/system-info)})

(api/define-routes)
