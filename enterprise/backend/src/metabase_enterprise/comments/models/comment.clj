(ns metabase-enterprise.comments.models.comment
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Comment [_model] :comment)

(doto :model/Comment
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def CommentContent
  "Validation for comment content - expects JSON"
  (mu/with-api-error-message
   [:and
    {:error/message "Comment content must be valid JSON"
     :json-schema   {:type "object"}}
    [:map]]
   (deferred-tru "Comment content must be valid JSON.")))

(def CreateComment
  "Schema for creating a new comment"
  [:map
   [:target_type {:optional false} [:enum "document"]]
   [:target_id {:optional false} ms/PositiveInt]
   [:child_target_id {:optional true} [:maybe :string]]
   [:parent_comment_id {:optional true} [:maybe ms/PositiveInt]]
   [:content {:optional false} CommentContent]])

(def UpdateComment
  "Schema for updating a comment"
  [:map
   [:content {:optional true} CommentContent]
   [:is_resolved {:optional true} :boolean]])

(methodical/defmethod t2/batched-hydrate [:model/Comment :creator]
  "Hydrate the creator (user) of a comment based on the creator_id."
  [_model k comments]
  (mi/instances-with-hydrated-data
   comments k
   #(-> (t2/select [:model/User :id :email :first_name :last_name] :id (keep :creator_id comments))
        (map (juxt :id identity))
        (into {}))
   :creator_id {:default {}}))
