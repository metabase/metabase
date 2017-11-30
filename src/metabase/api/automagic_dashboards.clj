(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.feature-extraction.automagic-dashboards :as magic]))

; Should be POST, GET for testing convinience
(api/defendpoint GET "/"
  ""
  [database-id]
  (magic/populate-dashboards database-id))

(api/define-routes)
