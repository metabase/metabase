(ns metabase.dependencies.registry
  "The entities of the dependency graph, found through the dependencies specs of every model."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.dependencies.spec :as dependencies.spec]
   [metabase.models.resolution :as models.resolution]))

(set! *warn-on-reflection* true)

(defn- build-type->model
  "The model of each entity type, after loading every model namespace, throwing when two models declare one type."
  []
  (models.resolution/load-all-models!)
  (reduce (fn [acc model]
            (if-let [entity-type (:type (dependencies.spec/spec model))]
              (do
                (when-let [other (get acc entity-type)]
                  (throw (ex-info (str "Two models declare the entity type " entity-type)
                                  {:type entity-type :models [other model]})))
                (assoc acc entity-type model))
              acc))
          {}
          (sort (keys (dissoc (methods dependencies.spec/spec) :default)))))

(def ^:private type->model*
  "[[build-type->model]] cached on the methods of the spec, a key that only invalidates it."
  (memoize/fifo (fn [_spec-methods] (build-type->model)) :fifo/threshold 1))

(defn type->model
  "The model of each entity type, as `{entity-type model}`."
  []
  (type->model* (methods dependencies.spec/spec)))

(defn entity-types
  "The entity types of the dependency graph."
  []
  (set (keys (type->model))))

(defn entity-model
  "The model whose rows are the entities of `entity-type`, or nil."
  [entity-type]
  (get (type->model) (keyword entity-type)))

(defn entity-spec
  "The dependencies spec of the model whose rows are the entities of `entity-type`, or nil."
  [entity-type]
  (some-> (entity-model entity-type) dependencies.spec/spec))

(defn model-type
  "The entity type of `model`, or nil when its rows are not entities."
  [model]
  (:type (dependencies.spec/spec model)))
