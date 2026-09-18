(ns metabase-enterprise.metabot.provider
  "Enterprise behaviour for LLM provider connections."
  (:require
   [metabase-enterprise.cloud-add-ons.core :as cloud-add-ons]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util.log :as log]))

(def ^:private managed-ai-product-type "metabase-ai-managed")
(def ^:private tiered-ai-product-type "metabase-ai-tiered")

(defn- managed-ai-product-type-to-cancel
  "The add-on backing this instance's managed AI, or nil when there is nothing to cancel.

  An instance still on legacy tiered pricing only has its add-on cancelled when it could have moved to metered
  pricing; without that offer the tiered add-on is the only thing keeping Metabot working, so removing the
  connection leaves the subscription alone."
  []
  (cond
    (premium-features/has-feature? :metabase-ai-managed)
    managed-ai-product-type

    (and (premium-features/has-feature? :offer-metabase-ai-managed)
         (premium-features/has-feature? :metabot-v3))
    tiered-ai-product-type))

(defenterprise cancel-managed-ai-subscription!
  "Cancel the Metabase Cloud add-on that backs the Metabase-managed provider."
  :feature :none
  []
  (when (premium-features/is-hosted?)
    (when-let [product-type (managed-ai-product-type-to-cancel)]
      (try
        (cloud-add-ons/remove-add-on! product-type)
        (catch Exception e
          (log/warnf e "Error cancelling the %s add-on after removing the managed provider connection"
                     product-type)
          (throw e))))))
