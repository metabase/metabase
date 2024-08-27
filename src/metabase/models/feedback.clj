(ns metabase.models.feedback
  "This namespace handles operations related to user feedback submitted via the application."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def Feedback
  "The feedback model."
  :model/Feedback)

;; Define transformations for the feedback model
(t2/deftransforms :model/Feedback
  {:namespace mi/transform-keyword})

;; Function to fetch detailed feedback information in batches if needed
(defn hydrate-feedback-details
  "Hydrates a batch of feedback entries with their detailed information."
  [feedbacks]
  (map (fn [feedback]
         (assoc feedback :details (t2/select-one :model/Feedback :id (:id feedback))))
       feedbacks))

;; Define the `before-insert` hook to ensure data integrity
(t2/define-before-insert :model/Feedback
  [{:keys [subject description] :as feedback}]
  ;; Ensure that subject and description are not null or blank
  (assert (not (str/blank? subject)) "Feedback subject cannot be blank")
  (assert (not (str/blank? description)) "Feedback description cannot be blank")
  ;; Optionally, you can add default values or transformations here
  ;; (e.g., trim whitespace from fields if needed)
  feedback)

;; Define any necessary delete logic
(t2/define-before-delete :model/Feedback
  [feedback]
  ;; Prevent deletion if there are related entries in some other model
  (let [related-entries (t2/select :model/SomeRelatedModel :feedback_id (:id feedback))]
    (when (seq related-entries)
      (throw (ex-info "Cannot delete feedback because it has related entries" {:status-code 403})))))

;; Optional: Additional methods for handling feedback logic if needed
(defn update-feedback-description
  "Update the description of a feedback entry."
  [feedback-id description]
  (assert (not (str/blank? description)) "Feedback description cannot be blank")
  (t2/update! Feedback feedback-id {:description description}))
