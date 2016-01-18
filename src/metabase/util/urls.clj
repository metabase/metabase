(ns metabase.util.urls
  (:require [metabase.models.setting :as setting]))

(defn pulse-url [id]
  (format "%s/pulse#%d" (setting/get :-site-url) id))

(defn dashboard-url [id]
  (format "%s/dash/%d" (setting/get :-site-url) id))

(defn question-url [id]
  (format "%s/card/%d" (setting/get :-site-url) id))

(defn segment-url [id]
  (format "%s/admin/datamodel/segment/%d" (setting/get :-site-url) id))
