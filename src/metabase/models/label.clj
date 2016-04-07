(ns metabase.models.label
  (:require [korma.core :as k]
            [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity Label :label)

(defn- num-slugs-starting-with
  "Return the number of `Label` slugs that start with a given PREFIX string."
  [prefix]
  (:count (first (k/select Label
                   (k/aggregate (count :*) :count)
                   (k/where {:slug [like (str prefix \%)]})))))

(defn- uniqify-slug
  "Make sure SLUG is unique, and append a number suffix to it otherwise.

     ;; my_cool_slug is unused
     (uniqify-slug \"my_cool_slug\") -> \"my_cool_slug\"

     ;; my_cool_slug is already used
     (uniqify-slug \"my_cool_slug\") -> \"my_cool_slug_2\""
  [slug]
  (if-not (db/exists? Label :slug slug)
    slug
    ;; recur just to double-check the uniqified slug is actually unique
    (uniqify-slug (str slug \_ (inc (num-slugs-starting-with slug))))))

(def ^:private slugify (comp uniqify-slug u/slugify))

(defn- pre-insert [{label-name :name, :as label}]
  ;; TODO - it probably makes sense to check if the slug is already being used
  ;; and add a unique suffix if so, e.g. `cool_topic` and `cool_topic_2`
  (assoc label :slug (slugify label-name)))

(defn- pre-update [{label-name :name, :as label}]
  (if-not label-name
    label
    (assoc label :slug (slugify label-name))))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete 'CardLabel :label_id id))

(u/strict-extend (class Label)
  i/IEntity
  (merge i/IEntityDefaults
         {:can-read?          (constantly true)
          :can-write?         (constantly true)
          :pre-insert         pre-insert
          :pre-update         pre-update
          :pre-cascade-delete pre-cascade-delete}))
