(ns metabase-enterprise.config-from-file.settings
  (:require
   [clojure.spec.alpha :as s]
   [clojure.tools.logging :as log]
   [metabase-enterprise.config-from-file.interface :as config-from-file.i]
   [metabase.models.setting :as setting]
   [metabase.util.i18n :refer [trs]]))

(defmethod config-from-file.i/section-spec :settings
  [_section-name]
  (s/map-of keyword? any?))

(defmethod config-from-file.i/initialize-section! :settings
  [_section-name settings]
  (log/info (trs "Setting setting values from config file"))
  (doseq [[setting-name setting-value] settings]
    (log/info (trs "Setting value for Setting {0}" setting-name))
    (setting/set! setting-name setting-value)))
