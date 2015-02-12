(ns metabase.db.internal
  "Internal functions and macros used by the public-facing functions in `metabase.db`."
  (:require [korma.core :refer :all]))

(defn- pull-kwargs
  "Where FORMS is a sequence like `[:id 1 (limit 3)]`, return a map of kwarg pairs and sequence of remaining forms.

     (pull-kwargs [:id 1 (limit 3) (order :id :ASC]) -> [{:id 1} [(limit 3) (order :id ASC)]"
  ([forms]
   (pull-kwargs {} [] forms))
  ([kwargs-acc forms-acc [arg1 & rest-args]]
   (if-not arg1 [kwargs-acc forms-acc]
           (if (keyword? arg1)
             (recur (assoc kwargs-acc arg1 (first rest-args)) forms-acc (rest rest-args))
             (recur kwargs-acc (conj forms-acc arg1) rest-args)))))

(defn sel-apply-kwargs
  "Pull kwargs from forms and add korma `where` form if applicable."
  [forms]
  (let [[kwargs-map forms] (pull-kwargs forms)]
    (if-not (empty? kwargs-map) (conj forms `(where ~kwargs-map))
            forms)))

(defn entity-field-keys
  "Lookup default field keys for ENTITY or destucture entity to get overriden defaults.
   Note DEFAULT-FIELDS-FN is passed as an argument to avoid circular dependencies with `metabase.db`."
  [default-fields-fn entity]
  (let [[entity & field-keys] (if (vector? entity) entity
                                  [entity])
        field-keys (or field-keys
                       (default-fields-fn (eval entity)))]
    [entity field-keys]))

(defn sel-apply-fields
  "When field-keys are specified, add `fields` clause to forms."
  [field-keys forms]
  (if-not (empty? field-keys) (conj forms `(fields ~@field-keys))
          forms))
