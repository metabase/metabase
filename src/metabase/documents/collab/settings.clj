(ns metabase.documents.collab.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting enable-document-collab
  (deferred-tru "Enable the experimental document collaborative editing WebSocket server. Requires the y-crdt-jni native library at runtime.")
  :type       :boolean
  :default    false
  :visibility :internal
  :setter     :none
  :export?    false
  :audit      :never
  :doc        false)
