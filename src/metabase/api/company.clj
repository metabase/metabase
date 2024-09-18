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
  ;; Logging incoming and existing data for debugging
  (println "Incoming `company_name`:" company_name)

  (let [existing   (api/write-check Company id)  ;; Check write permissions
        clean-body (u/select-keys-when body       ;; Select fields to update
                     :present #{:company_name})
        changes    (when-not (= clean-body existing)  ;; Check if there are changes to apply
                     clean-body)]

    (println "Existing entity from DB:" existing)
    (println "ID used for update:" id)
    (println "Changes to apply:" changes)

    ;; Apply changes if there are any
    (when changes
      (let [update-result (t2/update! Company id changes)]
        (println "Update result:" update-result)))  ;; Log the result of the update

    ;; Fetch the updated entity
    (let [updated-entity (t2/select-one Company :id id)]
      (println "Updated entity fetched after update:" updated-entity)
      (when updated-entity
        (let [hydrated-entity (t2/hydrate updated-entity :db)]
          ;; Ensure the event is correctly published with a valid topic
          (events/publish-event! :event/company-update  
                                 {:object hydrated-entity :user-id api/*current-user-id*})
          hydrated-entity)))))

(api/defendpoint PUT "/:id"
  "Update a `Company` detail with ID."
  [id :as {{:keys [company_name], :as body} :body}]
  {id                      ms/PositiveInt
   company_name            [:maybe ms/NonBlankString]}
  (write-check-and-update-company! id body))

(api/define-routes)
