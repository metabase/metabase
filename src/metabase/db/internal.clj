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
        _ (println "FIELD KEYS: " field-keys)
        _ (println "ENTITY: " entity)
        _ (println "ENTITY TYPE: " (type entity))
        field-keys (or field-keys
                       (default-fields-fn (entity->korma entity)))
        _ (println "FIELD KEYS: " field-keys)]
    [entity field-keys]))

(defn sel-apply-fields
  "When field-keys are specified, add `fields` clause to forms."
  [field-keys forms]
  (if-not (empty? field-keys) (conj forms `(fields ~@field-keys))
          forms))

(defn entity->korma
  "Convert an ENTITY argument to `sel`/`sel-fn` into the form we should pass to korma `select` and to various multi-methods such as
   `post-select`.

    *  If entity is a vector like `[User :name]`, only keeps the first arg (`User`)
    *  Converts fully-qualified entity name strings like `\"metabase.models.user/User\"` to the corresponding entity
       and requires their namespace if needed."
  [entity]
  {:post [(= (type %) :korma.core/Entity)]}
  (if (vector? entity) (entity->korma (first entity))
      (if (string? entity) (let [ns (-> (.split ^String entity "/")
                                        first
                                        symbol)]
                             (require ns)
                             (eval (symbol entity)))
          entity)))
