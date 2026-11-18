(ns metabase.dependencies.core
  "The dependencies spec through which each model says how the dependency graph tracks it, the helpers its functions
  are built with, and the registry of the entities that the specs declare."
  (:require
   [metabase.dependencies.calculation]
   [metabase.dependencies.registry]
   [metabase.dependencies.schema]
   [metabase.dependencies.spec]
   [potemkin :as p]))

(comment
  metabase.dependencies.calculation/keep-me
  metabase.dependencies.registry/keep-me
  metabase.dependencies.schema/keep-me
  metabase.dependencies.spec/keep-me)

(p/import-vars
 [metabase.dependencies.spec
  Spec
  spec]
 [metabase.dependencies.calculation
  merge-dependencies
  parameters-dependencies
  query-dependencies
  visualization-settings-dependencies
  with-native-dependencies]
 [metabase.dependencies.registry
  entity-model
  entity-spec
  entity-types
  model-type
  type->model])
