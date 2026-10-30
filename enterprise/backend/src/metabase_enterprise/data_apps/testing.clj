(ns metabase-enterprise.data-apps.testing
  "What the `/api/testing` endpoints do to data apps, which outside of tests change only through a repository import:
  create one, replace its bundle, delete it, and generate the typed schema of the questions and actions in its
  collection."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.typed-schema :as data-apps.typed-schema]
   [metabase.api.common :as api]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private create-defaults
  "What a new app starts with: an empty bundle, and unless its request says otherwise, the bundle path the app template
  builds to."
  {:bundle_path "dist/index.js"
   :bundle      (data-app/file->bundle "")})

(defenterprise-schema create-data-app! :- ::data-apps.schema/data-app
  "Create the data app `app` describes, with its resource collection and an empty bundle, and return it."
  :feature :data-apps
  [app :- ::data-apps.schema/data-app.create-request]
  (t2/with-transaction [_conn]
    (data-apps.db/data-app (data-apps.db/insert-data-app-returning-pk! (merge create-defaults {:display_name (:name app)} app)))))

(defn- existing-data-app
  "The data app named `slug`, or a 404."
  [slug]
  (api/check-404 (data-apps.db/data-app-by-slug slug)))

(defenterprise-schema replace-data-app-bundle! :- ::data-apps.schema/data-app
  "Replace the bundle of the data app named `slug` with the bundle file `bundle`, and return the app."
  :feature :data-apps
  [slug   :- ::data-apps.schema/slug
   bundle :- ::data-apps.schema/bundle-text]
  (let [app (existing-data-app slug)]
    (data-apps.db/update-data-app! (:id app) {:bundle (data-app/file->bundle bundle)})
    (data-apps.db/data-app (:id app))))

(defenterprise-schema delete-data-app! :- :nil
  "Delete the data app named `slug` with its bundle and its collection."
  :feature :data-apps
  [slug :- ::data-apps.schema/slug]
  (data-apps.db/delete-data-app! (:id (existing-data-app slug)))
  nil)

(defenterprise-schema data-app-typed-schema :- :string
  "The TypeScript module of the questions and actions in the collection of the data app named `slug`."
  :feature :data-apps
  [slug :- ::data-apps.schema/slug]
  (data-apps.typed-schema/generate (existing-data-app slug)))
