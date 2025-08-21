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
  []
  (let [un-localized (t2/select :model/TransformTag :built_in_type [:is-not nil])]
    (when (seq un-localized)
      (log/info "Localizing initial tags for site locale.")
      (let [values {"hourly"  (i18n/trs "hourly")
                    "daily"   (i18n/trs "daily")
                    "weekly"  (i18n/trs "weekly")
                    "monthly" (i18n/trs "monthly")}]
        (doseq [{:keys [built_in_type]} un-localized
                :let [name (get values built_in_type)]
                :when name
                :when (pos? (t2/update! :model/TransformTag
                                        :built_in_type built_in_type
                                        {:name name
                                         :built_in_type nil}))]
          (log/info (str "Localized " built_in_type " tag for site locale.")))))))

(defmethod task/init! ::LocalizeTags [_]
  (when (setup/has-user-setup)
    (localize-tags)))
