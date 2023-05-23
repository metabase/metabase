(ns metabase-enterprise.models
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]))

(defenterprise resolve-enterprise-model
  "TODO"
  :feature :none
  [x]
  (when (and (keyword? x)
             (= (namespace x) "model"))
    (doseq [feature @premium-features/premium-features]
      (do
        (u/ignore-exceptions
         (let [model-namespace (symbol (str "metabase-enterprise." (name feature) ".models." (u/->kebab-case-en (name x))))]
           (tap> model-namespace)
           ;; use `classloader/require` which is thread-safe and plays nice with our plugins system
           (classloader/require model-namespace))))))
  x)
