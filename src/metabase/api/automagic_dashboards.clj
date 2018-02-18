(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models.table :refer [Table]]
            [toucan.db :as db]))

; Should be POST, GET for testing convinience
(api/defendpoint GET "/database/:id"
  "Create automagic dashboards for all visible tables in database with id `ìd`."
  [id]
  (->> (db/select Table
         :db_id id
         :visibility_type nil)
       (remove (some-fn magic/link-table? magic/single-field-table?))
       (keep magic/automagic-dashboard)))

(api/defendpoint GET "/table/:id"
  "Create an automagic dashboard for table with id `ìd`."
  [id]
  [(magic/automagic-dashboard (Table id))])

(api/define-routes)
