(ns ^:deprecated metabase.models.label
  "Labels that can be applied to Cards. Deprecated in favor of Collections."
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel ^:deprecated Label :label)

(defn- assert-unique-slug [slug]
  (when (db/exists? Label :slug slug)
    (throw (ex-info (tru "Name already taken")
             {:status-code 400, :errors {:name (tru "A label with this name already exists")}}))))

(defn- pre-insert [{label-name :name, :as label}]
  (assoc label :slug (u/prog1 (u/slugify label-name)
                       (assert-unique-slug <>))))

(defn- pre-update [{label-name :name, id :id, :as label}]
  (if-not label-name
    label
    (assoc label :slug (u/prog1 (u/slugify label-name)
                         (or (db/exists? Label, :slug <>, :id id) ; if slug hasn't changed no need to check for uniqueness
                             (assert-unique-slug <>))))))         ; otherwise check to make sure the new slug is unique

(defn- pre-delete [label]
  (db/delete! 'CardLabel :label_id (u/get-id label)))

(u/strict-extend (class Label)
  models/IModel
  (merge models/IModelDefaults
         {:pre-insert pre-insert
          :pre-update pre-update
          :pre-delete pre-delete})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  (constantly true)
          :can-write? (constantly true)}))
