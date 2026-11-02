(ns metabase-enterprise.data-apps.apps
  "The connected repository's URL."
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting]))

(set! *warn-on-reflection* true)

(defn repo-url
  "The connected remote-sync repository URL, or nil when none is configured. Read
   by keyword so this OSS namespace has no compile-time dependency on the
   enterprise remote-sync module; returns nil when that module (and its setting)
   isn't loaded."
  []
  (let [url (try (setting/get :remote-sync-url) (catch Throwable _ nil))]
    (when-not (str/blank? url)
      url)))
