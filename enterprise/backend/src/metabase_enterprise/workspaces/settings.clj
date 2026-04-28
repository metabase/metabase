(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me)

(defonce ^{:doc "True iff this instance was started with a `workspace` section in its `config.yml`.
  Per Alex (2026-04-28): the presence of `workspace` in config.yml is the canonical signal
  that this is a development/child instance.

  This atom is reset to true by the eventual config-file loader (port of montreal's
  `metabase-enterprise.advanced-config.file.workspace`) once it successfully parses a
  workspace section. Until that namespace lands on this branch, this stays false."}
  workspace-config-present?
  (atom false))

(defsetting has-remappings-enabled
  (deferred-tru "Whether the table remapping feature is available on this instance. True on instances configured as workspace children (via `workspace` in config.yml) or whenever at least one TableRemapping row exists.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :setter     :none
  :getter     (fn []
                (or @workspace-config-present?
                    (t2/exists? :model/TableRemapping)))
  :audit      :never
  :doc        false)
