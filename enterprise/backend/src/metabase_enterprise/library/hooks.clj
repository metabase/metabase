(ns metabase-enterprise.library.hooks
  "Implements the hooks of `metabase.library.hooks`, creating the Library whenever the library feature is available."
  (:require
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]))

(defn- ensure-library-collection!
  "Creates the Library and any of its missing system collections, logging rather than throwing a failure."
  []
  (try
    (collections/ensure-library-collection!)
    (catch Throwable e
      (log/warnf "Failed to create the Library: %s" (ex-message e)))))

(defenterprise after-startup
  "Creates the Library and any of its missing system collections."
  :feature :library
  []
  (ensure-library-collection!))

(defenterprise after-premium-token-update
  "Creates the Library and any of its missing system collections, which the new token may have enabled."
  :feature :library
  []
  (ensure-library-collection!))
