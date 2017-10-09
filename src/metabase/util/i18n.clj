(ns metabase.util.i18n
  (:require
    [puppetlabs.i18n.core :refer [available-locales]])
  (:import java.util.Locale))

(defn available-locales-with-names
  []
  (map (fn [locale] [locale (.getDisplayName (Locale/forLanguageTag locale))]) (available-locales)))

(defn set-locale
  "This sets the local for the instance"
  [locale]
  (Locale/setDefault (Locale/forLanguageTag locale)))
