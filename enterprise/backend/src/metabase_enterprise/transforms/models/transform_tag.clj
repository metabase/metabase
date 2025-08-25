(ns metabase-enterprise.transforms.models.transform-tag
  (:require
   [metabase.util.i18n :as i18n]
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

(defn- translate-name [tag]
  (let [values {"hourly"  (i18n/deferred-trs "hourly")
                "daily"   (i18n/deferred-trs "daily")
                "weekly"  (i18n/deferred-trs "weekly")
                "monthly" (i18n/deferred-trs "monthly")}
        name (get values (:built_in_type tag))]
    {:name name}))

(t2/define-after-select :model/TransformTag [tag]
  (if (nil? (:built_in_type tag))
    tag
    (merge tag (translate-name tag))))

(t2/define-before-update :model/TransformTag [tag]
  (if (nil? (:built_in_type tag))
    tag
    (-> (merge (translate-name tag) ;; translated default names
               {:built_in_type nil} ;; never translate this again
               (t2/changes tag))    ;; include user edits
        (update :name str)))) ;; convert deferred to string
