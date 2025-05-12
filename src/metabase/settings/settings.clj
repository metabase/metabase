(ns metabase.settings.settings
  (:require
   [metabase.config :as config]
   [metabase.settings.models.setting :as setting]))

(defn application-name-for-setting-descriptions
  "Returns the value of the [[application-name]] setting so setting docstrings can be generated during the compilation stage.
   Use this instead of `application-name` in descriptions, otherwise the `application-name` setting's `:enabled?`
  function will be called during compilation, which will fail because it will attempt to perform i18n, which is not
  allowed during compilation."
  []
  (if *compile-files*
    "Metabase"
    (binding [config/*disable-setting-cache* true]
      (setting/get :application-name))))
