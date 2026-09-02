(ns metabase-enterprise.advanced-config.file.settings
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defmethod advanced-config.file.i/section-spec :settings
  [_section-name]
  (s/map-of keyword? any?))

(defmethod advanced-config.file.i/initialize-section! :settings
  [_section-name settings]
  (log/info "Setting setting values from config file")
  (doseq [[setting-name setting-value] settings]
    (log/infof "Setting value for Setting %s" setting-name)
    (cond
      (not (setting/registered? setting-name))
      (log/warn (u/format-color :yellow "Ignoring unknown setting in config: %s." (name setting-name)))

      ;; a sysadmin-only setting goes into the in-memory metabase.env layer, never the DB
      (setting/sysadmin-only? setting-name)
      (setting/merge-env-file-value! setting-name setting-value)

      :else
      (setting/set! setting-name setting-value))))
