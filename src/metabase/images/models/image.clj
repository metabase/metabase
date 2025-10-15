(ns metabase.images.models.image
  (:require
   [metabase.images.schema :as images.schema]
   [metabase.system.core :as system]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/Image :metabase/model)

(methodical/defmethod t2/table-name :model/Image
  [_model]
  "image")

(mu/defn image-id->contents-url :- :string
  "Given an image ID return the URL the frontend can use to fetch the image contents."
  [image-id :- ::images.schema/id]
  (format "%s/api/images/%d/contents" (system/site-url) image-id))

(methodical/defmethod t2/batched-hydrate [:model/User :profile_image_url]
  [_model _k users]
  (let [image-ids     (into #{} (keep :profile_image_id) users)
        id->image-url (when (seq image-ids)
                        (t2/select-fn->fn :id (comp image-id->contents-url :id)
                                          [:model/Image :id :url]
                                          :id [:in image-ids]))]
    (for [user users]
      (assoc user :profile_image_url (get id->image-url (:profile_image_id user))))))
