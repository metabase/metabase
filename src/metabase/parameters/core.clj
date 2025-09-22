(ns metabase.parameters.core
  (:require
   [metabase.parameters.models.transforms]
   [metabase.parameters.schema]
   [potemkin :as p]))

(comment metabase.parameters.schema/keep-me
         metabase.parameters.models.transforms/keep-me)

(p/import-vars
  [metabase.parameters.schema
   normalize-parameter
   normalize-parameters
   normalize-parameter-mapping
   normalize-parameter-mappings]
  [metabase.parameters.models.transforms
   transform-parameters
   transform-parameter-mappings])
