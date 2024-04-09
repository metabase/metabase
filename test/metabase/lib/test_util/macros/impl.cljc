(ns metabase.lib.test-util.macros.impl
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(defn field-name
  "Impl for [[metabase.lib.test-util.macros]]."
  [field-id]
  (:name (lib.metadata/field meta/metadata-provider field-id)))

(defn field-base-type
  "Impl for [[metabase.lib.test-util.macros]]."
  [field-id]
  (:base-type (lib.metadata/field meta/metadata-provider field-id)))
