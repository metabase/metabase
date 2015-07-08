(ns metabase.db.internal
  "Internal functions and macros used by the public-facing functions in `metabase.db`."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [korma.core :refer [where], :as k]
            [metabase.config :as config]
            [metabase.models.interface :as models]
            [metabase.util :as u]))

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
  "Convert an ENTITY argument to `sel` into the form we should pass to korma `select` and to various multi-methods such as
   `post-select`.

    *  If entity is a vector like `[User :name]`, only keeps the first arg (`User`)
    *  Converts fully-qualified entity name strings like `\"metabase.models.user/User\"` to the corresponding entity
       and requires their namespace if needed.
    *  Symbols like `'metabase.models.user/User` are handled the same way as strings."
  (memoize
   (fn -entity->korma [entity]
     {:post [(:metabase.models.interface/entity %)]}
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


;;; ## ---------------------------------------- SEL 2.0 FUNCTIONS ----------------------------------------

;;; Low-level sel implementation

(defmacro sel-fn [& forms]
  (let [forms               (sel-apply-kwargs forms)
        entity-placeholder  (gensym "ENTITY--")]
    (loop [query `(k/select* ~entity-placeholder), [[f & args] & more] forms]
      (cond
        f          (recur `(~f ~query ~@args) more)
        (seq more) (recur query more)
        :else      `[(fn [~entity-placeholder]
                       ~query) ~(str query)]))))

(defn sel-exec [entity [select-fn log-str]]
  (let [[entity field-keys] (destructure-entity entity)
        entity              (entity->korma entity)
        entity+fields       (assoc entity :fields (or field-keys
                                                            (:metabase.models.interface/default-fields entity)))]
    ;; Log if applicable
    (future
      (when (config/config-bool :mb-db-logging)
        (log/debug "DB CALL: " (:name entity)
                   (or (:fields entity+fields) "*")
                   (s/replace log-str #"korma.core/" ""))))

    (->> (k/exec (select-fn entity+fields))
         (map (partial models/internal-post-select entity))
         (map (partial models/post-select entity)))))

(defmacro sel* [entity & forms]
  `(sel-exec ~entity (sel-fn ~@forms)))

;;; :field

(defmacro sel:field [[entity field] & forms]
  `(let [field# ~field]
     (map field# (sel* [~entity field#] ~@forms))))

;;; :id

(defmacro sel:id [entity & forms]
  `(sel:field [~entity :id] ~@forms))

;;; :fields

(defn sel:fields* [fields results]
  (for [result results]
    (select-keys result fields)))

(defmacro sel:fields [[entity & fields] & forms]
  `(let [fields# ~(vec fields)]
     (sel:fields* (set fields#) (sel* `[~~entity ~@fields#] ~@forms))))

;;; :id->fields

(defn sel:id->fields* [fields results]
  (->> results
       (map (u/rpartial select-keys fields))
       (zipmap (map :id results))))

(defmacro sel:id->fields [[entity & fields] & forms]
  `(let [fields# ~(conj (set fields) :id)]
     (sel:id->fields* fields# (sel* `[~~entity ~@fields#] ~@forms))))

;;; :field->field

(defn sel:field->field* [f1 f2 results]
  (into {} (for [result results]
             {(f1 result) (f2 result)})))

(defmacro sel:field->field [[entity f1 f2] & forms]
  `(let [f1# ~f1
         f2# ~f2]
     (sel:field->field* f1# f2# (sel* [~entity f1# f2#] ~@forms))))

;;; : id->field

(defmacro sel:id->field [[entity field] & forms]
  `(sel:field->field [~entity :id ~field] ~@forms))

;;; :field->id

(defmacro sel:field->id [[entity field] & forms]
  `(sel:field->field [~entity ~field :id] ~@forms))

;;; :field->obj

(defn sel:field->obj* [field results]
  (into {} (for [result results]
             {(field result) result})))

(defmacro sel:field->obj [[entity field] & forms]
  `(sel:field->obj* ~field (sel* ~entity ~@forms)))

;;; :one & :many

(defmacro sel:one [& args]
  `(first (metabase.db/sel ~@args (k/limit 1))))

(defmacro sel:many [& args]
  `(metabase.db/sel ~@args))
