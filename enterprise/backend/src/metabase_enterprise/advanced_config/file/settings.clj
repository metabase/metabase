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

(def ^:private setting-priority
  "Lower numbers are applied first. This allows certain settings (e.g. `:premium-embedding-token`) which are depended
  on by other settings (e.g. `:jwt-enabled`) to be loaded first, before those that depend on them.

  This makes the `:settings` section independent of the order keys appear in the config file (UXW-3782)."
  {:premium-embedding-token 0})

(defn- sort-by-dependency-order
  "Order the config-file settings so feature-gating settings (the premium token) are applied first.

  `sort-by` is stable, so settings of equal priority keep their original order."
  [settings]
  (sort-by (fn [[setting-name _]]
             (get setting-priority setting-name 1000))
           settings))

(defmethod advanced-config.file.i/initialize-section! :settings
  [_section-name settings]
  (log/info "Setting setting values from config file")
  (doseq [[setting-name setting-value] (sort-by-dependency-order settings)]
    (log/infof "Setting value for Setting %s" setting-name)
    (if (setting/registered? setting-name)
      (setting/set! setting-name setting-value)
      (log/warn (u/format-color :yellow "Ignoring unknown setting in config: %s." (name setting-name))))))
