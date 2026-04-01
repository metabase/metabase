(ns metabase.metabot.models.metabot-permissions
  "Metabot permission type definitions and defaults.
  The Toucan2 model registration for `:model/MetabotPermissions` lives in
  [[metabase-enterprise.metabot.permissions]].")

(def metabot-permissions
  "Metabot permission definitions. Values are ordered from most permissive to least permissive."
  {:permission/metabot                  {:values [:yes :no]}
   :permission/metabot-sql-generation   {:values [:yes :no]}
   :permission/metabot-nql              {:values [:yes :no]}
   :permission/metabot-other-tools      {:values [:yes :no]}})

(def perm-types
  "The set of defined metabot permission types."
  (set (keys metabot-permissions)))

(def perm-type-defaults
  "Default values for each metabot permission type."
  {:permission/metabot                  :no
   :permission/metabot-sql-generation   :no
   :permission/metabot-nql              :no
   :permission/metabot-other-tools      :no})
