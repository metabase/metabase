(ns metabase-enterprise.representations.v0.core
  (:require
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.collection :as v0-coll]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.database :as v0-database]
   [metabase-enterprise.representations.v0.document :as v0-document]
   [metabase-enterprise.representations.v0.metric :as v0-metric]
   [metabase-enterprise.representations.v0.model :as v0-model]
   [metabase-enterprise.representations.v0.question :as v0-question]
   [metabase-enterprise.representations.v0.snippet :as v0-snippet]
   [metabase-enterprise.representations.v0.transform :as v0-transform]))

(defn toucan-model
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
  "Export the Toucan entity to a v0 representation."
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
