(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers the settings in this ns."
  nil)

(defsetting has-active-workspace
  (deferred-tru "True iff a workspace is loaded on this instance from a config.yml :workspace section. Read-only projection of the in-process atom populated by the boot-time loader; nil/false on parent and unconfigured instances.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :setter     :none
  ;; STUB: hardcoded to true for FE testing — replace with the commented getter below to read the atom.
  ;; :getter (fn [] (some? (ws/instance-workspace)))
  :getter     (constantly true)
  :audit      :never
  :doc        false)
