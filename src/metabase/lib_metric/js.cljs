(ns metabase.lib-metric.js
  "JavaScript-facing API for lib-metric functions."
  (:require
   [metabase.lib-metric.core :as lib-metric]))

;; Ensure all lib-metric code is loaded for any defmethod registrations
(comment lib-metric/keep-me)

;; Example exported function (add actual exports as needed)
;; (defn ^:export create-metric-definition [opts]
;;   (clj->js (lib-metric/create-metric-definition (js->clj opts :keywordize-keys true))))
