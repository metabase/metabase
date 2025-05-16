(ns metabase.settings.settings
  (:require
   [metabase.config :as config]
   [metabase.settings.models.setting :as setting]
   [metabase.util.log :as log]
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

(defn image-response
  "Returns a the requested setting as a binary ring response if the setting is a data-url encoded string, such as an image."
  [key]
  (try
    (setting/with-setting-access-control
      (when-let [[content-type body] (setting/as-binary key)]
        {:status 200
         :headers {"content-type" content-type}
         :body body}))
    (catch Throwable e
      (log/errorf e "Setting %s not found" key)
      ;; Return nil on failure to try the next handler
      nil)))
