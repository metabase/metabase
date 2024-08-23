(ns metabase.models.checkpoints
  "Checkpoints are used to track the progress or state of various operations or activities.
  This file defines the necessary functions and database interactions for managing these checkpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def Checkpoint
  "The checkpoint model."
  :model/Checkpoint)

;; Transformations for the checkpoint model
(t2/deftransforms :model/Checkpoint
  {:namespace mi/transform-keyword})

;; Function to fetch detailed checkpoint information in batches
(defn hydrate-checkpoint-details
  "Hydrates a batch of checkpoints with their detailed information."
  [checkpoints]
  (map (fn [checkpoint]
         (assoc checkpoint :details (t2/select-one :model/Checkpoint :id (:id checkpoint))))
       checkpoints))

;; Define the `before-insert` hook to ensure data integrity
(t2/define-before-insert :model/Checkpoint
  [{:keys [name] :as checkpoint}]
  (assert (not (str/blank? name)) "Checkpoint name cannot be blank")
  (assoc checkpoint :slug (u/slugify name)))

;; Define the `before-update` hook to handle changes safely
(t2/define-before-update :model/Checkpoint
  [checkpoint]
  (let [checkpoint-before-updates (t2/instance :model/Checkpoint (t2/original checkpoint))]
    (when (str/blank? (:name (t2/changes checkpoint)))
      (throw (ex-info "Checkpoint name cannot be blank" {:status-code 400})))))

;; Define any necessary delete logic
(t2/define-before-delete :model/Checkpoint
  [checkpoint]
  (let [related-entries (t2/select :model/SomeRelatedModel :checkpoint_id (:id checkpoint))]
    (when (seq related-entries)
      (throw (ex-info "Cannot delete checkpoint because it has related entries" {:status-code 403})))))

;; Optional: Additional methods for handling checkpoint logic, such as progress tracking or status updates
(defn update-checkpoint-status
  "Update the status of a checkpoint."
  [checkpoint-id status]
  (t2/update! Checkpoint checkpoint-id {:status status}))
