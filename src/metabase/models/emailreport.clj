(ns metabase.models.emailreport
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer [assoc-permissions-sets]]
                             [hydrate :refer [realize-json]]
                             [emailreport-recipients :refer [EmailReportRecipients]]
                             [org :refer [Org org-can-read org-can-write]]
                             [user :refer [User]])
            [metabase.util :as util]))


(def mode-active 0)
(def mode-disabled 1)

(def modes
  [{:id mode-active :name "Active"},
   {:id mode-disabled :name "Disabled"}])

(def days-of-week
  [{:id "sun" :name "Sun"},
   {:id "mon" :name "Mon"},
   {:id "tue" :name "Tue"},
   {:id "wed" :name "Wed"},
   {:id "thu" :name "Thu"},
   {:id "fri" :name "Fri"},
   {:id "sat" :name "Sat"}])

(def times-of-day
  [{:id "morning" :name "Morning" :realhour 8},
   {:id "midday" :name "Midday" :realhour 12},
   {:id "afternoon" :name "Afternoon" :realhour 16},
   {:id "evening" :name "Evening" :realhour 20},
   {:id "midnight" :name "Midnight" :realhour 0}])


(defentity EmailReport
  (table :report_emailreport))


(defmethod post-select EmailReport [_ {:keys [id creator_id organization_id] :as emailreport}]
  (-> emailreport
    (realize-json :dataset_query)
    (realize-json :schedule)
    (util/assoc*
      :creator (delay
                 (check creator_id 500 "Can't get creator: Query doesn't have a :creator_id.")
                 (sel :one User :id creator_id))
      :organization (delay
                      (check organization_id 500 "Can't get database: Query doesn't have a :database_id.")
                      (sel :one Org :id organization_id))
      :recipients (delay
                    (sel :many User
                      (where {:id [in (subselect EmailReportRecipients (fields :user_id) (where {:emailreport_id id}))]}))))
    assoc-permissions-sets))