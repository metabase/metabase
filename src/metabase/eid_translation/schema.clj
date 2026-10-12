(ns metabase.eid-translation.schema
  "Malli schemas for the entity-ID translation module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::entity-ids-by-model
  "The entity IDs to translate, grouped by the model they belong to. Which models exist is checked by
  [[metabase.eid-translation.util/model->entity-ids->ids]], whose error names them."
  (ms/string-keyed-map [:sequential :string]))
