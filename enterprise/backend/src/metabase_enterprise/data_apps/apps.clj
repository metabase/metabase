(ns metabase-enterprise.data-apps.apps
  "Creating data apps, and the connected repository's URL."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

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

(defn create-app!
  "Create the data app `row`, filling the draft with its slug if there is one, and return its ID. Throws a 409
   when a data app that isn't a draft already has the slug."
  [{slug :name :as row}]
  (t2/with-transaction [_conn]
    (let [existing (data-apps.db/data-app-by-slug slug)
          row      (assoc row :draft false)]
      (api/check (or (nil? existing) (:draft existing))
                 [409 (tru "A data app with this slug already exists.")])
      (if existing
        (do (data-apps.db/update-data-app! (:id existing) (dissoc row :name))
            (:id existing))
        (data-apps.db/insert-data-app-returning-pk! row)))))
