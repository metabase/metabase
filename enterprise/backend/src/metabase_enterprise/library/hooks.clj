(ns metabase-enterprise.library.hooks
  "Implements the hooks of `metabase.library.hooks`, creating the Library once the instance has the library feature."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(defn- ensure-library-collection!
  "Creates the Library when it doesn't exist yet, logging rather than throwing a failure."
  []
  (try
    (cluster-lock/with-cluster-lock ::ensure-library-collection
      (when-not (collections/library-collection)
        (log/info "Creating the Library")
        (collections/create-library-collection!)))
    (catch Throwable e
      (log/warnf "Failed to create the Library: %s" (ex-message e)))))

(defenterprise after-startup
  "Creates the Library when the instance has the library feature and no Library exists yet."
  :feature :library
  []
  (ensure-library-collection!))

(defenterprise after-premium-token-update
  "Creates the Library when the new premium token enabled the library feature and no Library exists yet."
  :feature :library
  []
  (ensure-library-collection!))
