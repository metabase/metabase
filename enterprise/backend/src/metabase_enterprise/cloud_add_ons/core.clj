(ns metabase-enterprise.cloud-add-ons.core
  "Provisioning and removal of Metabase Cloud add-ons, shared by the `/api/ee/cloud-add-ons` endpoints and by
  features that cancel their own add-on when they are turned off."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.premium-features.core :as premium-features]))

(def add-on-bundles
  "Product types whose purchase provisions additional add-ons in the same upsert call. Purchasing
  Storage (`dwh-rent`) also provisions `etl-connections`, mirroring the store's storage purchase flow."
  {"dwh-rent" [{:product-type "dwh-rent" :prepaid-units 0}
               {:product-type "etl-connections" :prepaid-units 1}]})

(defn add-ons-for-removal
  "Add-ons to remove for a given `product-type`. Bundled product types (see [[add-on-bundles]]) expand
  into all their members; everything else is a single add-on."
  [product-type]
  (if-let [bundle (add-on-bundles product-type)]
    (mapv #(select-keys % [:product-type]) bundle)
    [{:product-type product-type}]))

(defn remove-add-on!
  "Cancel `product-type` with the Store and refresh this instance's token features. Throws whatever the Store
  client throws, so callers decide how to surface a failure."
  [product-type]
  (hm.client/call :change-add-ons :remove-add-ons (add-ons-for-removal product-type))
  (premium-features/clear-cache!))
