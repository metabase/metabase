(ns metabase-enterprise.transforms.models.transform-tag
  (:require
   [metabase.setup.core :as setup]
   [metabase.task.core :as task]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTag [_model] :transform_tag)

(doto :model/TransformTag
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(defn tag-name-exists?
  "Check if a tag with the given name already exists"
  [tag-name]
  (t2/exists? :model/TransformTag :name tag-name))

(defn tag-name-exists-excluding?
  "Check if a tag with the given name exists, excluding the specified ID"
  [tag-name tag-id]
  (t2/exists? :model/TransformTag :name tag-name :id [:not= tag-id]))

(defn localize-tags
  "Localize the initial tags in the transform_tag table."
  ([]
   (localize-tags (i18n/user-locale)))
  ([locale]
   (doseq [[name built-in] [[(i18n/translate locale "hourly")  "hourly"]
                            [(i18n/translate locale "daily")   "daily"]
                            [(i18n/translate locale "weekly")  "weekly"]
                            [(i18n/translate locale "monthly") "monthly"]]]
     (let [res (t2/update! :model/TransformTag
                           :built_in_type built-in
                           {:name name
                            :built_in_type nil})]
       (when (pos? res)
         (log/info (str "Localized " built-in " tag for locale " locale ".")))))))

(defmethod task/init! ::LocalizeTags [_]
  (when (setup/has-user-setup)
    (localize-tags)))
