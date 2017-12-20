(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.feature-extraction.automagic-dashboards :as magic]
            [metabase.models.table :refer [Table]]
            [toucan.db :as db]))

; Should be POST, GET for testing convinience
(api/defendpoint GET "/database/:id"
  ""
  [id]
  (mapcat magic/populate-dashboards (db/select Table :db_id id)))

(api/defendpoint GET "/table/:id"
  ""
  [id]
  (magic/populate-dashboards (Table id)))

(api/define-routes)
