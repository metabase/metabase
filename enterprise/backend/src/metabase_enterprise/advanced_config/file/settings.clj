(ns metabase-enterprise.advanced-config.file.settings
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (clojure.lang ExceptionInfo)))

(defmethod advanced-config.file.i/section-spec :settings
  [_section-name]
  (s/map-of keyword? any?))

(defmethod advanced-config.file.i/initialize-section! :settings
  [_section-name settings]
  (log/info "Setting setting values from config file")
  (doseq [[setting-name setting-value] settings]
    (log/infof "Setting value for Setting %s" setting-name)
    (try
      (setting/set! setting-name setting-value)
      (catch ExceptionInfo e
        (if (true? (:metabase.models.setting/unknown-setting-error (ex-data e)))
          (log/warn (u/format-color :yellow "Ignoring unknown setting in config: %s." (name setting-name)))
          (throw e))))))
