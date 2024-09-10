(ns metabase.api.company
  "/api/company endpoints."
  (:require
    [compojure.core :refer [PUT GET POST]]
    [metabase.api.common :as api]
    [metabase.events :as events]
    [metabase.models.company :as company :refer [Company]]  ;; Correct import of Company
    [metabase.util :as u]
    [metabase.util.malli.schema :as ms]
    [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint GET "/"
  "Fetch all company details."
  []
  (->> (t2/select :company)
       (into [])))  ;; Directly return all rows from the `company` table

(api/defendpoint GET "/:id"
  "Fetch a single company detail by ID."
  [id]
  {id ms/PositiveInt}
  (let [result (t2/select-one :company :id id)]
    ;; Ensure hydration only happens if needed
    (if result
      (t2/hydrate result :db)  ;; Hydrate with necessary data if needed
      result)))

(api/defendpoint POST "/"
  "Create a new company detail."
  [:as {{:keys [company_name]} :body}]
  {company_name ms/NonBlankString}
  ;; Perform permission checks if necessary (you can add them back if needed)
  (let [company-data {:company_name company_name
                      :creator_id   api/*current-user-id*}]
    (t2/with-transaction [_conn]
      (let [company (api/check-500 (t2/insert! :company company-data))]
        company))))  ;; Return the created company

;; Add this derive statement at the appropriate location in your codebase
(derive :event/company-update :metabase/event)

(defn- write-check-and-update-company!
  "Check whether the current user has write permissions, then update Company with values in `body`. Returns updated/hydrated Company."
  [id {:keys [company_name], :as body}]
  (let [existing   (api/write-check Company id)  ;; Check write permissions
        clean-body (u/select-keys-when body       ;; Select fields to update
                     :present #{:company_name})
        changes    (when-not (= clean-body existing)  ;; Check if there are changes to apply
                     clean-body)]
    (when changes
      (t2/update! Company id changes))  ;; Apply the changes if any
    (u/prog1 (t2/hydrate (t2/select-one Company :id id) :db)  ;; Return the updated entity, hydrated
      ;; Ensure the event is correctly published with a valid topic
      (events/publish-event! :event/company-update  
                             {:object (t2/select-one Company :id id) :user-id api/*current-user-id*}))))


(api/defendpoint PUT "/:id"
  "Update a `Company` detail with ID."
  [id :as {{:keys [company_name], :as body} :body}]
  {id                      ms/PositiveInt
   company_name            [:maybe ms/NonBlankString]}
  (write-check-and-update-company! id body))

(api/define-routes)
