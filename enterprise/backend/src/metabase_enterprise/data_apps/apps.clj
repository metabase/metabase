(ns metabase-enterprise.data-apps.apps
  "Creating data apps, and the connected repository's URL."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
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

(defn collection-name
  "The name of the resource collection the API creates for the data app with `slug`."
  [slug]
  (format "Data App: %s" slug))

(defn create-app!
  "Create the data app `row` with a new root collection of the `data-apps` namespace as its resource collection, and
  return the app's ID; throws a 409 when a data app already has the slug."
  [{slug :name :as row}]
  (t2/with-transaction [_conn]
    (api/check (not (data-apps.db/data-app-exists? slug))
               [409 (tru "A data app with this slug already exists.")])
    (let [collection (collections/create-collection! {:name      (collection-name slug)
                                                      :namespace (name collections/data-apps-ns)})]
      (data-apps.db/insert-data-app-returning-pk! (assoc row :resource_collection_id (:id collection))))))
