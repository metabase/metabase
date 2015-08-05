(ns metabase.models.revision
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :as db]
            (metabase.models [diff :refer [diff-str]]
                             [hydrate :refer [hydrate]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(def ^:const models
  #{:card})

(defn- model? [model]
  (and (keyword model)
       (contains? models model)))

(def ^:const max-revisions
  "Maximum number of revisions to keep for each individual object. After this limit is surpassed, the oldest revisions will be deleted."
  15)

(defentity Revision
  [(table :revision)
   (types :object :json, :model :keyword)]

  (pre-insert [_ {:keys [model] :as revision}]
    (assert (model? model)
      (format "Invalid model: %s" model))
    (assoc revision :timestamp (u/new-sql-timestamp)))

  (pre-update [_ _]
    (throw (Exception. "You cannot update a Revision!"))))

(defn revisions
  "Get the revisions for MODEL + MODEL-ID in reverse chronological order."
  [model model-id]
  {:pre [(model? model)
         (integer? model-id)]}
  (db/sel :many Revision :model (name model), :model_id model-id, (order :timestamp :DESC)))

(defn- delete-old-revisions
  "Delete old revisions of MODEL + MODEL-ID when there are more than `max-revisions` in the DB."
  [model model-id]
  {:pre [(model? model)
         (integer? model-id)]}
  (let [old-revisions (drop max-revisions (db/sel :many :id Revision, :model (name model), :model_id model-id, (order :timestamp :DESC)))] ; for some reason (offset max-revisions isn't working)
    (when (seq old-revisions)
      (delete Revision (where {:id [in old-revisions]})))))

(defn push-revision
  "Record a new `Revision` for MODEL + MODEL-ID."
  [& {:keys [model model-id user-id object]}]
  {:pre [(model? model)
         (integer? user-id)
         (db/exists? User :id user-id)
         (integer? model-id)
         ;; TODO - check that model-id is valid for model
         (map? object)]}
  (db/ins Revision :model model, :model_id model-id, :user_id user-id, :object object)
  (delete-old-revisions model model-id))


(defn x []
  (push-revision :model :card, :model-id 1, :user-id 1, :object {:name "Tips created by day"})
  (push-revision :model :card, :model-id 1, :user-id 1, :object {:name "Spots created by day"})
  (revisions :card 1))

(defn y []
  (-> (revisions :card 1)
      (hydrate :user)))

(defn- revisions-add-diff-strs [revisions]
  (loop [acc [], [r1 r2 & more] revisions]
    (if-not r2 acc
            (recur (conj acc (assoc r1 :description (diff-str (:common_name (:user r1)) (:model r1) (:object r1) (:object r2))))
                   (conj more r2)))))

(defn z []
  (-> (revisions :card 1)
      (hydrate :user)
      revisions-add-diff-strs))
