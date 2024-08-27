(ns metabase.api.feedback
  "/api/feedback endpoints."
  (:require
   [compojure.core :refer [POST]]
   [malli.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation] ;; Add validation as seen in user.clj
   [metabase.util.malli.schema :as ms] ;; Import the malli schema utility
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Define the correct schema based on the table definition
(def feedback-schema
  [:map
   [:description :string]
   [:task [:maybe :string]]
   [:submitted_by [:maybe :string]]
   [:chat_history [:maybe :string]]
   [:subject :string]])

(api/defendpoint POST "/"
  "Submit feedback to the `feedback` table."
  [:as {body :body}] ;; Match the pattern used in user.clj for handling body
  ;; Log the body to see what's being received
  (println "Received body:" body)

  ;; Validate the schema using malli
  (if (m/validate feedback-schema body)
    ;; If validation passes, insert feedback into the table
    (do
      (t2/insert! :feedback body)
      {:status :ok, :message "Feedback submitted successfully."})
    ;; If validation fails, return a 400 error
    {:status 400, :message "Invalid feedback data."}))

(api/define-routes)
