(ns metabase.db.internal
  "Internal functions and macros used by the public-facing functions in `metabase.db`."
  (:require [korma.core :refer [where]]))

(declare entity->korma)

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

(defn destructure-entity
  "Take an ENTITY of the form `entity` or `[entity & field-keys]` and return a pair like `[entity field-keys]`."
  [entity]
  (if-not (vector? entity) [entity nil]
          [(first entity) (vec (rest entity))]))

(def entity->korma
  "Convert an ENTITY argument to `sel`/`sel-fn` into the form we should pass to korma `select` and to various multi-methods such as
   `post-select`.

    *  If entity is a vector like `[User :name]`, only keeps the first arg (`User`)
    *  Converts fully-qualified entity name strings like `\"metabase.models.user/User\"` to the corresponding entity
  and requires their namespace if needed."
  (memoize
   (fn -entity->korma [entity]
     {:post [(= (type %) :korma.core/Entity)]}
     (cond (vector? entity) (-entity->korma (first entity))
           (string? entity) (-entity->korma (symbol entity))
           (symbol? entity) (try (eval entity)
                                 (catch clojure.lang.Compiler$CompilerException _ ; a wrapped ClassNotFoundException
                                   (-> entity
                                       str
                                       (.split "/")
                                       first
                                       symbol
                                       require)
                                   (eval entity)))
           :else entity))))
