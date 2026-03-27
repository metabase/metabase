(ns metabase.metabot.models.metabot-permissions
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})

(def metabot-permissions
  "Metabot permission definitions. Values are ordered from most permissive to least permissive."
  {:permission/metabot                  {:values [:yes :no]}
   :permission/metabot-model            {:values [:large :medium :small]}
   :permission/metabot-sql-generation   {:values [:yes :no]}
   :permission/metabot-nql              {:values [:yes :no]}
   :permission/metabot-other-tools      {:values [:yes :no]}})

(def perm-types
  "The set of defined metabot permission types."
  (set (keys metabot-permissions)))

(def perm-type-defaults
  "Default values for each metabot permission type."
  {:permission/metabot                  :no
   :permission/metabot-model            :small
   :permission/metabot-sql-generation   :no
   :permission/metabot-nql              :no
   :permission/metabot-other-tools      :no})
