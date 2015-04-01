(ns metabase.models.emailreport
  (:require [clojure.data.json :as json]
            [clojure.set :as set]
            [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer [assoc-permissions-sets perms-none]]
                             [hydrate :refer [realize-json]]
                             [emailreport-recipients :refer [EmailReportRecipients]]
                             [org :refer [Org org-can-read org-can-write]]
                             [user :refer [User]])
            [metabase.util :as util]))


;; ## Static Definitions

(def modes
  {:active   {:id 0
              :name "Active"}
   :disabled {:id 1
              :name "Disabled"}})

(def mode-kws
  (set (keys modes)))

(defn mode->id [mode]
  {:pre [(contains? mode-kws mode)]}
  (:id (modes mode)))

(defn mode->name [mode]
  {:pre [(contains? mode-kws mode)]}
  (:name (modes mode)))

(def modes-input
  [{:id (mode->id :active),   :name (mode->name :active)}
   {:id (mode->id :disabled), :name (mode->name :disabled)}])

(def days-of-week
  "Simple `vector` of the days in the week used for reference and lookups.

   NOTE: order is important here!!
         these indexes match the values from clj-time `day-of-week` function (0 = Sunday, 6 = Saturday)"
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

(defn time-of-day->realhour
  "Time-of-day to realhour"
  [time-of-day]
  (-> (filter (fn [tod] (= time-of-day (:id tod))) times-of-day)
      (first)
      (:realhour)))

;; ## Entity

(defentity EmailReport
  (table :report_emailreport))

(def execution-details-fields [EmailReport
                               :id
                               :organization_id
                               :creator_id
                               :name
                               :description
                               :mode
                               :public_perms
                               :version
                               :dataset_query
                               :schedule
                               :created_at
                               :updated_at
                               :email_addresses])

(defmethod pre-insert EmailReport [_ {:keys [dataset_query schedule] :as report}]
  (let [defaults {:public_perms perms-none
                  :mode (mode->id :active)
                  :version 1
                  :created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)}]
    (-> (merge defaults report)
        (assoc :dataset_query (json/write-str dataset_query)
               :schedule (json/write-str schedule)))))

(defmethod pre-update EmailReport [_ {:keys [dataset_query schedule id] :as report}]
  (assoc report                                        ; don't increment `version` here.
         :updated_at    (util/new-sql-timestamp)       ; we do that in the API endpoint
         :dataset_query (json/write-str dataset_query)
         :schedule      (json/write-str schedule)))


(defmethod post-select EmailReport [_ {:keys [id creator_id organization_id] :as report}]
  (-> report
    (realize-json :dataset_query :schedule)
    (util/assoc*
      :creator      (delay (check creator_id 500 "Can't get creator: Query doesn't have a :creator_id.")
                           (sel :one User :id creator_id))
      :organization (delay (check organization_id 500 "Can't get database: Query doesn't have a :database_id.")
                           (sel :one Org :id organization_id))
      :recipients   (delay (sel :many User
                                (where {:id [in (subselect EmailReportRecipients (fields :user_id) (where {:emailreport_id id}))]}))))
    assoc-permissions-sets))

(defmethod pre-cascade-delete EmailReport [_ {:keys [id]}]
  (cascade-delete EmailReportRecipients :emailreport_id id))


;; ## Related Functions

(defn update-recipients
  "Update the `EmailReportRecipients` for EMAIL-REPORT.
   USER-IDS should be a definitive collection of *all* IDs of users who should receive the report.

   *  If an ID in USER-IDS has no corresponding existing `EmailReportRecipients` object, one will be created.
   *  If an existing `EmailReportRecipients` has no corresponding ID in USER-IDs, it will be deleted."
  {:arglists '([email-report user-ids])}
  [{:keys [id]} user-ids]
  {:pre [(integer? id)
         (coll? user-ids)
         (every? integer? user-ids)]}
  (let [recipients-old (set (sel :many :field [EmailReportRecipients :user_id] :emailreport_id id))
        recipients-new (set user-ids)
        recipients+    (set/difference recipients-new recipients-old)
        recipients-    (set/difference recipients-old recipients-new)]
    (when (seq recipients+)
      (let [vs (map #(assoc {:emailreport_id id} :user_id %)
                    recipients+)]
        (insert EmailReportRecipients
                (values vs))))
    (when (seq recipients-)
      (delete EmailReportRecipients
              (where {:emailreport_id id
                      :user_id [in recipients-]})))))
