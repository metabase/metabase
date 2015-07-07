(ns metabase.models.interface
  (:require (clojure.tools [logging :as log]
                           [macro :refer [macrolet]])
            [clojure.walk :refer [macroexpand-all]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.config :as config]
            metabase.db.internal
            [metabase.util :as u]))

;;; ## ---------------------------------------- ENTITIES ----------------------------------------

(defprotocol IEntity
  (pre-insert [this instance]
    "Gets called by `ins` immediately before inserting a new object immediately before the korma `insert` call.
     This provides an opportunity to do things like encode JSON or provide default values for certain fields.

         (pre-insert [_ query]
           (let [defaults {:version 1}]
             (merge defaults query))) ; set some default values")

  (post-insert [this instance]
    "Gets called by `ins` after an object is inserted into the DB. (This object is fetched via `sel`).
     A good place to do asynchronous tasks such as creating related objects.
     Implementations should return the newly created object.")

  (pre-update [this instance]
    "Called by `upd` before DB operations happen. A good place to set updated values for fields like `updated_at`, or serialize maps into JSON.")

  (post-update [this instance]
    "Called by `upd` after a SQL `UPDATE` *succeeds*. (This gets called with whatever the output of `pre-update` was).

     A good place to schedule asynchronous tasks, such as creating a `FieldValues` object for a `Field`
     when it is marked with `special_type` `:category`.

     The output of this function is ignored.")

  (post-select [this instance]
    "Called on the results from a call to `sel`. Default implementation doesn't do anything, but
     you can provide custom implementations to do things like add hydrateable keys or remove sensitive fields.")

  (pre-cascade-delete [this instance]
    "Called by `cascade-delete` for each matching object that is about to be deleted.
     Implementations should delete any objects related to this object by recursively
     calling `cascade-delete`.

     The output of this function is ignored.

        (pre-cascade-delete [_ {database-id :id :as database}]
          (cascade-delete Card :database_id database-id)
          ...)")

  (internal-pre-insert  [this instance])
  (internal-pre-update  [this instance])
  (internal-post-select [this instance]))

(defn- identity-second [_ obj] obj)
(def ^:private constantly-nil (constantly nil))

(def ^:const ^:private default-entity-method-implementations
  {:pre-insert           #'identity-second
   :post-insert          #'identity-second
   :pre-update           #'identity-second
   :post-update          #'constantly-nil
   :post-select          #'identity-second
   :pre-cascade-delete   #'constantly-nil})

(def ^:const ^:private type-fns
  {:json    {:in  'metabase.db.internal/write-json
             :out 'metabase.db.internal/read-json}
   :keyword {:in  `name
             :out `keyword}})

(defmacro apply-type-fns [obj-binding direction entity-map]
  {:pre [(symbol? obj-binding)
         (keyword? direction)
         (map? entity-map)]}
  (let [fns (m/map-vals #(direction (type-fns %)) (::types entity-map))]
    (if-not (seq fns) obj-binding
            `(cond-> ~obj-binding
               ~@(mapcat (fn [[k f]]
                           [`(~k ~obj-binding) `(update-in [~k] ~f)])
                         fns)))))

(defn -invoke-entity
  "Basically the same as `(sel :one Entity :id id)`." ; TODO - deduplicate with sel
  [entity id]
  (when (metabase.config/config-bool :mb-db-logging)
    (clojure.tools.logging/debug
     "DB CALL: " (:name entity) id))
  (let [[obj] (k/select (assoc entity :fields (::default-fields entity))
                        (k/where {:id id})
                        (k/limit 1))]
    (some->> obj
             (internal-post-select entity)
             (post-select entity))))

(defn- update-updated-at [obj]
  (assoc obj :updated_at (u/new-sql-timestamp)))

(defn- update-created-at-updated-at [obj]
  (let [ts (u/new-sql-timestamp)]
    (assoc obj :created_at ts, :updated_at ts)))

(defmacro macrolet-entity-map [entity & entity-forms]
  `(macrolet [(~'default-fields [m# & fields#]       `(assoc ~m# ::default-fields [~@(map keyword fields#)]))
              (~'timestamped    [m#]                 `(assoc ~m# ::timestamped true))
              (~'types          [m# & {:as fields#}] `(assoc ~m# ::types ~fields#))
              (~'hydration-keys [m# & fields#]       `(assoc ~m# :hydration-keys #{~@(map keyword fields#)}))]
     (-> (k/create-entity ~(name entity))
         ~@entity-forms)))

(defmacro defentity
  "Similar to korma `defentity`, but creates a new record type where you can specify protocol implementations."
  [entity entity-forms & methods]
  {:pre [(vector? entity-forms)
         (every? list? methods)]}
  (let [entity-symb               (symbol (format "%sEntity" (name entity)))
        internal-post-select-symb (symbol (format "internal-post-select-%s" (name entity)))
        entity-map                (eval `(macrolet-entity-map ~entity ~@entity-forms))]
    `(do
       (defrecord ~entity-symb []
         clojure.lang.IFn
         (~'invoke [~'this ~'id]
           (-invoke-entity ~'this ~'id)))

       (extend ~entity-symb
         IEntity ~(merge default-entity-method-implementations
                         {:internal-pre-insert  `(fn [~'_ obj#]
                                                   (-> (apply-type-fns obj# :in ~entity-map)
                                                       ~@(when (::timestamped entity-map)
                                                           [update-created-at-updated-at])))
                          :internal-pre-update  `(fn [~'_ obj#]
                                                   (-> (apply-type-fns obj# :in ~entity-map)
                                                       ~@(when (::timestamped entity-map)
                                                           [update-updated-at])))
                          :internal-post-select `(fn [~'_ obj#]
                                                   (apply-type-fns obj# :out ~entity-map))}
                         (into {}
                               (for [[method-name & impl] methods]
                                 {(keyword method-name) `(fn ~@impl)}))))
       (def ~entity
         (~(symbol (format "map->%sEntity" (name entity))) ~entity-map)))))


;;; # ---------------------------------------- INSTANCE ----------------------------------------

(defprotocol IModelInstanceApiSerialize
  (api-serialize [this]
    "Called on all objects being written out by the API. Default implementations return THIS as-is, but models can provide
     custom methods to strip sensitive data, from non-admins, etc."))

(extend Object
  IModelInstanceApiSerialize {:api-serialize identity})

(extend nil
  IModelInstanceApiSerialize {:api-serialize identity})
