(ns metabase.settings.settings
  (:require
   [metabase.config.core :as config]
   [metabase.util.malli :as mu]))

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
