(ns metabase.prototype.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting prototype-semantic-layer-version
  "The version of the semantic layer definitions on this instance. See [[metabase.prototype.semantic-layer]]."
  :type       :integer
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)
