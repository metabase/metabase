(ns metabase.models.annotation
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [org :refer [Org]]
                             [user :refer [User]])))


(def annotation-general 0)
(def annotation-description 1)


(defentity Annotation
  (table :annotation_annotation)
  timestamped)

(defmethod post-select Annotation [_ {:keys [organization_id author_id] :as annotation}]
  (assoc annotation
         :author       (delay (sel :one User :id author_id))
         :organization (delay (sel :one Org :id organization_id))))
;; TODO - would probably be nice to associate a function which pulls the object the annotation points to
