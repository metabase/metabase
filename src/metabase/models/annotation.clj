(ns metabase.models.annotation
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
              [hydrate :refer [realize-json]]
              [org :refer [Org]]
              [user :refer [User]])
            [metabase.util :as util]))


(defentity Annotation
  (table :annotation_annotation))


(defmethod pre-insert Annotation [_ annotation]
  (let [defaults {:created_at (util/new-sql-date)
                  :updated_at (util/new-sql-date)}]
    (merge defaults annotation)))


(defmethod pre-update Annotation [_ annotation]
  (assoc annotation :updated_at (util/new-sql-date)))


(defmethod post-select Annotation [_ {:keys [organization_id author_id] :as annotation}]
  (-> annotation
    ;; TODO - would probably be nice to associate a function which pulls the object the annotation points to
    (assoc :author (sel-fn :one User :id author_id)
           :organization (sel-fn :one Org :id organization_id))))
