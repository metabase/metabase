(ns metabase-enterprise.serialization.schema
  "Malli schemas for the serialization module."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::validation-error
  "Why an entity of an archive does not match the schema of its model, or why a file of it cannot be read: the
  `:serdes/meta` path of the entity, or the name of the file."
  [:map {:closed true}
   [:path    :string]
   [:message :string]])

(mr/def ::validation-result
  "Whether every entity of an archive matches the schema of its model, and the errors of those that do not."
  [:map {:closed true}
   [:valid  :boolean]
   [:errors [:sequential ::validation-error]]])
