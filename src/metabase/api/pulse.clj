(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [hydrate :refer :all]
                             [database :refer [databases-for-org]]
                             [pulse :refer [Pulse modes-input days-of-week times-of-day] :as pulse]
                             [emailreport-executions :refer [EmailReportExecutions]]
                             [org :refer [Org]]
                             [user :refer [users-for-org]])
            [metabase.task.email-report :as report]
            [metabase.util :as util]))

(defannotation EmailReportMode
  "Check that param is a value int ID for an email report mode."
  [symb value :nillable]
  (annotation:Integer symb value)
  (checkp-contains? (set (map :id (vals model/modes))) symb value))

(defendpoint GET "/form_input"
  "Values of options for the create/edit `EmailReport` UI."
  []
  (let [dbs (databases-for-org org)
        users (users-for-org org)]
    {:permissions common/permissions
     :modes modes-input
     :days_of_week days-of-week
     :times_of_day times-of-day
     :timezones common/timezones
     :databases dbs
     :users users}))

(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (-> (sel :many Pulse (order :name :ASC))
      (hydrate :creator :channels)))


(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels] :as body} :body}]
  {name           Required
   schedule       Required
   mode           EmailReportMode
   public_perms   PublicPerms
   recipients     ArrayOfIntegers}
  (read-check Org organization)
  (let-500 [report (ins EmailReport
                     :creator_id *current-user-id*
                     :dataset_query dataset_query
                     :description description
                     :email_addresses email_addresses
                     :mode mode
                     :name name
                     :organization_id organization
                     :public_perms public_perms
                     :schedule schedule)]
    (model/update-recipients report recipients)
    (hydrate report :recipients)))


(defendpoint GET "/:id"
  "Fetch `EmailReport` with ID."
  [id]
  (->404 (sel :one EmailReport :id id)
         read-check
         (hydrate :creator :organization :can_read :can_write :recipients)))


(defendpoint PUT "/:id"
  "Update an `EmailReport`."
  [id :as {{:keys [dataset_query description email_addresses mode name public_perms schedule recipients] :as body} :body}]
  {name         NonEmptyString
   mode         EmailReportMode
   public_perms PublicPerms
   recipients   ArrayOfIntegers}
  (clojure.pprint/pprint recipients)
  (let-404 [report (sel :one EmailReport :id id)]
    (write-check report)
    (model/update-recipients report recipients)
    (check-500 (upd-non-nil-keys EmailReport id
                                 :dataset_query   dataset_query
                                 :description     description
                                 :email_addresses email_addresses
                                 :mode            mode
                                 :name            name
                                 :public_perms    public_perms
                                 :schedule        schedule
                                 :version         (inc (:version report)))))
  (-> (sel :one EmailReport :id id)
      (hydrate :creator :database :can_read :can_write)))


(defendpoint DELETE "/:id"
  "Delete an `EmailReport`."
  [id]
  (write-check EmailReport id)
  (cascade-delete EmailReport :id id))


(defendpoint POST "/:id"
  "Execute and send an `EmailReport`."
  [id]
  (read-check EmailReport id)
  (->> (report/execute-and-send id)
       (sel :one EmailReportExecutions :id)))


(define-routes)
