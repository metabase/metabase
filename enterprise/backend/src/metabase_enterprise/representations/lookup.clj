(ns metabase-enterprise.representations.lookup
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn lookup-by-id
  "Find and return a toucan entity given the representation type and id."
  [rep-type id]
  (t2/select-one (v0-common/type->model rep-type) :id id))

(defn lookup-by-entity-id
  "Find and return a toucan entity given the representation type and entity id."
  [rep-type entity-id]
  (t2/select-one (v0-common/type->model rep-type) :entity_id entity-id))

(defn lookup-by-name
  "Find and return a toucan entity given the representation type and its name.

   Will throw an exception if multiple entities are found with the same name."
  [rep-type name]
  (let [entities (t2/select (v0-common/type->model rep-type) :name name)]
    (if (= 1 (count entities))
      (first entities)
      (throw (ex-info (str "Multiple entities of type " rep-type " with name '" name "'.")
                      {:rep-type rep-type
                       :name name
                       :entities entities})))))
