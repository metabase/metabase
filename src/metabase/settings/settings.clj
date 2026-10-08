(ns metabase.settings.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.models.setting :refer [defsetting]]
   [metabase.util.malli :as mu]))

(defsetting settings-last-updated
  "When any Setting was last changed, as a timestamp string the application DB produced. Instances compare it against
  their own copy to notice that another instance has changed a Setting and their cache is stale.

  Written by [[metabase.settings.models.setting.cache/update-settings-last-updated!]] rather than through this
  Setting, which is why it has no setter: its value has to come from the application DB's clock, not from any one
  instance's. It is declared here so that it is a registered Setting like any other, and so its row is read like any
  other."
  :visibility :internal
  :type       :string
  :encryption :no
  :setter     :none
  :audit      :never
  :export?    false)

(mu/defn application-name-for-setting-descriptions
  "Returns the value of the [[application-name]] setting so setting docstrings can be generated during the compilation
  stage. Use this instead of `application-name` in descriptions, otherwise the `application-name` setting's
  `:enabled?` function will be called during compilation, which will fail because it will attempt to perform i18n,
  which is not allowed during compilation.

  `getter` should always be [[metabase.appearance.core/application-name]], but is dependency-injected to avoid
  circular dependencies between modules.

    (setting/application-name-for-setting-descriptions appearance/application-name)"
  [getter :- [:=> [:cat] :string]]
  (if *compile-files*
    "Metabase"
    (binding [config/*disable-setting-cache* true]
      (getter))))
