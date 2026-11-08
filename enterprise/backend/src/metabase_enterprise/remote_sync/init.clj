(ns metabase-enterprise.remote-sync.init
  (:require
   [metabase-enterprise.remote-sync.settings]
   [metabase.collections.core :as collections]
   [metabase.settings.core :as setting]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- remote-sync-init!
  "Stops syncing collections when no repository URL is set."
  []
  (when (and (nil? (setting/get-raw-value :remote-sync-url)) (collections/has-remote-synced-collection?))
    (log/info "Remote sync is off: no collection is synced any more")
    (collections/clear-remote-synced-collection!)))

(defmethod startup/def-startup-logic! ::remote-sync-setup
  [_]
  (remote-sync-init!))
