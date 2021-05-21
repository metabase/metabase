(ns metabase.api.comment
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.comment :as comment]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(api/defendpoint POST "/"
  "Create a new `Comment`."
  [:as {{:keys [text commented_item_id commented_item_type]} :body}]
  {text                s/Str
   commented_item_id   su/IntGreaterThanZero
   commented_item_type comment/commented-item-types}
  (let [comment-data {:text                text
                      :commented_item_id   commented_item_id
                      :commented_item_type commented_item_type
                      :author_id           api/*current-user-id*}]
    ;;TODO permissions
    (api/check-500
     (comment/create-comment! comment-data))))

(api/define-routes)
