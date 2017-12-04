(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.feature-extraction.automagic-dashboards :as magic]))

; Should be POST, GET for testing convinience
(api/defendpoint GET "/"
  ""
  [database-id table-id]
  (magic/populate-dashboards (if table-id
                               {:scope :table
                                :id table-id}
                               {:scope :database
                                :id database-id})))

(api/define-routes)
