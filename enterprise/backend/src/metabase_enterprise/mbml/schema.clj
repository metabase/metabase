(ns metabase-enterprise.mbml.schema
  "Malli schema definitions for MBML (Metabase Markup Language) entities.
  
  Defines schemas for validating MBML entities like Transform:v1 using Metabase's
  established Malli patterns with mr/def registry and user-friendly error messages."
  (:require
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; ------------------------------------------ Entity Type Schema -----------------------------------------------

(mr/def ::entity-type
  "Schema for valid MBML entity types. Currently supports Transform:v1."
  (mu/with-api-error-message
   [:enum "model/Transform:v1"]
   (deferred-tru "entity must be a valid MBML entity type (e.g. \"model/Transform:v1\")")))

;;; ------------------------------------------ Common Field Schemas ----------------------------------------------

(mr/def ::identifier
  "Schema for MBML entity identifiers. Must be a non-blank string."
  (mu/with-api-error-message
   ms/NonBlankString
   (deferred-tru "identifier must be a non-blank string")))

(mr/def ::name
  "Schema for MBML entity names. Must be a non-blank string."
  (mu/with-api-error-message
   ms/NonBlankString
   (deferred-tru "name must be a non-blank string")))

(mr/def ::database
  "Schema for database references. Must be a non-blank string."
  (mu/with-api-error-message
   ms/NonBlankString
   (deferred-tru "database must be a non-blank string")))

(mr/def ::target
  "Schema for target table/view names. Must be a non-blank string."
  (mu/with-api-error-message
   ms/NonBlankString
   (deferred-tru "target must be a non-blank string")))

(mr/def ::description
  "Schema for entity descriptions. Optional string field."
  [:maybe :string])

(mr/def ::tags
  "Schema for entity tags. Optional array of strings."
  [:maybe [:sequential :string]])

(mr/def ::source
  "Schema for source code content (SQL or Python). Optional string field."
  [:maybe :string])

;;; ------------------------------------------ Transform:v1 Schema -----------------------------------------------

(mr/def ::transform-v1
  "Schema for Transform:v1 MBML entities. Validates all required and optional fields
  according to the MBML specification."
  (mu/with-api-error-message
   [:map
    {:closed true}
    [:entity ::entity-type]
    [:name ::name]
    [:identifier ::identifier]
    [:database ::database]
    [:target ::target]
    [:description {:optional true} ::description]
    [:tags {:optional true} ::tags]
    [:source {:optional true} ::source]]
   (deferred-tru "must be a valid Transform:v1 entity with all required fields")))

;;; ------------------------------------------ General MBML Entity Schema ------------------------------------

(mr/def ::mbml-entity
  "General schema for any MBML entity. Currently only supports Transform:v1
  but can be extended to support additional entity types in the future."
  (mu/with-api-error-message
   [:multi {:dispatch :entity
            :error/message "invalid entity type"}
    ["model/Transform:v1" ::transform-v1]]
   (deferred-tru "must be a valid MBML entity")))
