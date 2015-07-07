(ns metabase.models.interface
  (:require [clojure.tools.logging :as log]
            [clojure.walk :refer [macroexpand-all]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.config :as config]))

(defprotocol IEntityPostSelect
  (post-select [this instance]
    "Called on the results from a call to `sel`. Default implementation doesn't do anything, but
     you can provide custom implementations to do things like add hydrateable keys or remove sensitive fields."))

(defprotocol IModelInstanceApiSerialize
  (api-serialize [this]
    "Called on all objects being written out by the API. Default implementations return THIS as-is, but models can provide
     custom methods to strip sensitive data, from non-admins, etc."))

(defprotocol IEntityInternal
  "Internal methods automatically defined by entities created with `defentity`."
  (internal-post-select [this instance]))

(defn- identity-second [_ obj]
  obj)

(extend Object
  IEntityPostSelect          {:post-select          identity-second}
  IEntityInternal            {:internal-post-select identity-second}
  IModelInstanceApiSerialize {:api-serialize        identity})

(extend nil
  IModelInstanceApiSerialize {:api-serialize identity})

(def ^:const ^:private type-fns
  {:json    {:in  'metabase.db.internal/write-json
             :out 'metabase.db.internal/read-json}
   :keyword {:in  `name
             :out `keyword}})

(defn- resolve-type-fns [types-map]
  (m/map-vals #(:out (type-fns %)) types-map))

(defn -invoke-entity [entity id]
  (future
    (when (metabase.config/config-bool :mb-db-logging)
      (clojure.tools.logging/debug
       "DB CALL: " (:name entity) id)))
  (let [[obj] (k/select entity (k/where {:id id}) (k/limit 1))]
    (when obj
      (->> obj
           (internal-post-select entity)
           (post-select entity)))))

(defmacro make-internal-post-select [obj kvs]
  `(cond-> ~obj
     ~@(mapcat (fn [[k f]]
                 [`(~k ~obj) `(update-in [~k] ~f)])
               (seq kvs))))

(defmacro defentity
  "Similar to korma `defentity`, but creates a new record type where you can specify protocol implementations."
  [entity entity-forms & specs]
  {:pre [vector? entity-forms]}
  (let [entity-symb               (symbol (format "%sEntity" (name entity)))
        internal-post-select-symb (symbol (format "internal-post-select-%s" (name entity)))
        entity-map                (eval `(-> (k/create-entity ~(name entity))
                                             ~@entity-forms))
        type-fns                  (resolve-type-fns (:metabase.db/types entity-map))]
    `(do
       (defrecord ~entity-symb []
         IEntityInternal
         (internal-post-select [~'_ ~'obj]
           ~(macroexpand-1 `(make-internal-post-select ~'obj ~type-fns)))

         clojure.lang.IFn
         (~'invoke [~'this ~'id]
           (-invoke-entity ~'this ~'id))

         ~@specs)
       (def ~entity            ; ~(vary-meta entity assoc :const true)
         (~(symbol (format "map->%sEntity" (name entity))) ~entity-map)))))
