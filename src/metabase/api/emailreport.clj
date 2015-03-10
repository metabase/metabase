(ns metabase.api.emailreport
  "/api/emailreport endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [hydrate :refer :all]
                             [database :refer [databases-for-org]]
                             [emailreport :refer [EmailReport modes-input days-of-week times-of-day]]
                             [emailreport-executions :refer [EmailReportExecutions]]
                             [user :refer [users-for-org]])
            [metabase.util :as util]))


(defendpoint GET "/form_input" [org]
  (require-params org)
  ; we require admin/default perms on the org to do this operation
  (check-403 ((:perms-for-org @*current-user*) org))
  (let [dbs (databases-for-org org)
        users (users-for-org org)]
    {:permissions common/permissions
     :modes modes-input
     :days_of_week days-of-week
     :times_of_day times-of-day
     :timezones common/timezones
     :databases dbs
     :users users}))


(defendpoint GET "/" [org f]
  ;; TODO - filter by f == "mine"
  ;; TODO - filter by creator == self OR public_perms > 0
  (require-params org)
  ; we require admin/default perms on the org to do this operation
  (check-403 ((:perms-for-org @*current-user*) org))
  (-> (sel :many EmailReport
        (where {:organization_id org})
        (where {:public_perms [> common/perms-none]})
        (order :name :ASC))
    (hydrate :creator :organization :can_read :can_write)))


(defendpoint POST "/" [:as {{:keys [organization] :as body} :body}]
  ; enforce a few required attributes
  (check-400 (util/contains-many? body :organization :name :dataset_query :schedule))
  ; we require admin/default perms on the org to do this operation
  (check-403 ((:perms-for-org @*current-user*) organization))
  ;; TODO - validate that for public_perms, mode, etc are within their expected set of possible values
  ;; TODO - deal with recipients
  (check-500 (->> (-> body
                    (select-keys [:organization :name :description :public_perms :mode :dataset_query :email_addresses :schedule])
                    (clojure.set/rename-keys {:organization :organization_id})
                    (assoc :creator_id *current-user-id*))
               (mapply ins EmailReport))))


(defendpoint GET "/:id" [id]
  (->404 (sel :one EmailReport :id id)
         read-check
         (hydrate :creator :organization :can_read :can_write)))


(defendpoint PUT "/:id" [id :as {body :body}]
  ; user must have WRITE permissions on the report
  (let-404 [report (sel :one EmailReport :id id)]
    (write-check report)
    ;; TODO - validate that for public_perms, mode, etc are within their expected set of possible values
    ;; TODO - deal with recipients
    (check-500 (->> (-> (merge report (util/select-non-nil-keys body :name :description :public_perms :mode :dataset_query :email_addresses :schedule))
                      ;; filter keys again AFTER merging with the existing report data.  this is needed to add version into the mix
                      (util/select-non-nil-keys :name :description :public_perms :mode :version :dataset_query :email_addresses :schedule))
                 (mapply upd EmailReport id)))
    (-> (sel :one EmailReport :id id)
      (hydrate :creator :database :can_read :can_write))))


(defendpoint DELETE "/:id" [id]
  (write-check EmailReport id)
  (del EmailReport :id id))


(defendpoint POST "/:id" [id]
  ;; TODO - implementation (execute a report)
  {:TODO "TODO"})


(defendpoint GET "/:id/executions" [id]
  (read-check EmailReport id)
  (-> (sel :many EmailReportExecutions :report_id id (order :created_at :DESC) (limit 25))
      (hydrate :organization)))


(define-routes)
