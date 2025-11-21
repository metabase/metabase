(ns metabase-enterprise.representations.v0.core
  (:require
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.collection :as v0-coll]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.database :as v0-database]
   [metabase-enterprise.representations.v0.document :as v0-document]
   [metabase-enterprise.representations.v0.metric :as v0-metric]
   [metabase-enterprise.representations.v0.model :as v0-model]
   [metabase-enterprise.representations.v0.question :as v0-question]
   [metabase-enterprise.representations.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.v0.transform :as v0-transform]
   [toucan2.core :as t2]))

(defn toucan-model
  "Returns the Toucan model keyword for a given v0 representation type.
   Maps representation types (e.g., :collection, :database) to their corresponding Toucan models."
  [representation-type]
  (case representation-type
    :collection v0-coll/toucan-model
    :database v0-database/toucan-model
    :document v0-document/toucan-model
    :metric v0-metric/toucan-model
    :model v0-model/toucan-model
    :question v0-question/toucan-model
    :snippet v0-snippet/toucan-model
    :transform v0-transform/toucan-model))

(defn export-entity
  "Export the Toucan entity to a v0 representation.

  resolve is a function that takes id and toucan model name and returns a ref"
  [t2-entity]
  (case (v0-common/representation-type t2-entity)
    :collection (v0-coll/export-collection t2-entity)
    :database (v0-database/export-database t2-entity)
    :document (v0-document/export-document t2-entity)
    :metric (v0-metric/export-metric t2-entity)
    :model (v0-model/export-model t2-entity)
    :question (v0-question/export-question t2-entity)
    :snippet (v0-snippet/export-snippet t2-entity)
    :transform (v0-transform/export-transform t2-entity)))

(defn yaml->toucan
  "Convert a v0 representation into data suitable for creating/updating an entity."
  [representation ref-index]
  (case (:type representation)
    :collection (v0-coll/yaml->toucan representation ref-index)
    :database (v0-database/yaml->toucan representation ref-index)
    :document (v0-document/yaml->toucan representation ref-index)
    :metric (v0-metric/yaml->toucan representation ref-index)
    :model (v0-model/yaml->toucan representation ref-index)
    :question (v0-question/yaml->toucan representation ref-index)
    :snippet (v0-snippet/yaml->toucan representation ref-index)
    :transform (v0-transform/yaml->toucan representation ref-index)))

(defn insert!
  "Insert a v0 representation as a new entity."
  [representation ref-index]
  (case (:type representation)
    :transform (v0-transform/insert! representation ref-index)
    ;; default
    (let [model (toucan-model (:type representation))
          toucan (->> (yaml->toucan representation ref-index)
                      (rep-t2/with-toucan-defaults model))]
      (t2/insert-returning-instance! model toucan))))

(defn update!
  "Update an existing v0 entity from a representation."
  [representation id ref-index]
  (case (:type representation)
    :transform (v0-transform/update! representation id ref-index)
    ;; default
    (let [model (toucan-model (:type representation))
          toucan (yaml->toucan representation ref-index)]
      (t2/update! model id toucan)
      (t2/select-one model :id id))))
