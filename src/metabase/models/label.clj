(ns metabase.models.label
  (:require [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity Label :label)

(defn- assert-unique-slug [slug]
  (when (db/exists? Label :slug slug)
    (throw (ex-info "Name already taken" {:status-code 400, :errors {:name "A label with this name already exists"}}))))

(defn- pre-insert [{label-name :name, :as label}]
  (assoc label :slug (u/prog1 (u/slugify label-name)
                       (assert-unique-slug <>))))

(defn- pre-update [{label-name :name, id :id, :as label}]
  (if-not label-name
    label
    (assoc label :slug (u/prog1 (u/slugify label-name)
                         (or (db/exists? Label, :slug <>, :id id) ; if slug hasn't changed no need to check for uniqueness
                             (assert-unique-slug <>))))))         ; otherwise check to make sure the new slug is unique

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete! 'CardLabel :label_id id))

(u/strict-extend (class Label)
  i/IEntity
  (merge i/IEntityDefaults
         {:can-read?          (constantly true)
          :can-write?         (constantly true)
          :pre-insert         pre-insert
          :pre-update         pre-update
          :pre-cascade-delete pre-cascade-delete}))
