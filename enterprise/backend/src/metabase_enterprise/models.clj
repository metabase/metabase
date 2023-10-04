(ns metabase-enterprise.models
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]))

(defenterprise resolve-enterprise-model
  "Tries to require a given model in each of the possible enterprise model namespaces, to ensure it is required."
  :feature :none
  [x]
  (when (and (keyword? x)
             (= (namespace x) "model")
             ;; Don't try to require if it's already registered as a :metabase/model, since that means it has already
             ;; been required
             (not (isa? x :metabase/model)))
    (doseq [feature @premium-features/premium-features]
      (u/ignore-exceptions
       (let [model-namespace (symbol (str "metabase-enterprise." (name feature) ".models." (u/->kebab-case-en (name x))))]
         ;; use `classloader/require` which is thread-safe and plays nice with our plugins system
         (classloader/require model-namespace)))))
  x)
