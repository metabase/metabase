(ns metabase-enterprise.data-apps.generate.app
  "A new data app's files: its `data_app.yaml` and its collection's YAML, each at the path a remote-sync export
  writes it."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private bundle-path
  "Where the app template builds its bundle, relative to the app's directory."
  "./dist/index.js")

(defn- name->slug
  "The slug `app-name` gives an app: its letters and numbers, lowercased, separated by single dashes."
  [app-name]
  (-> (u/lower-case-en app-name)
      (str/replace #"[^a-z0-9]+" "-")
      (str/replace #"^-+|-+$" "")))

(defn- file
  "The `entity`'s YAML file at the path a remote-sync export writes it, resolving collection paths with `collections`."
  [entity collections]
  {:path (serialization/entity-file-path {:collections collections :unique-name-fns (atom {})} entity)
   :yaml (serialization/entity-yaml entity)})

(mu/defn generate :- ::data-apps.schema/app-files
  "The `data_app.yaml` of a new app named `name`, served at `slug` (from the name by default), and its collection's
  file, both with new entity IDs."
  [{app-name :name :keys [slug description]} :- ::data-apps.schema/app-request]
  (let [slug          (or slug (name->slug app-name))
        _             (when-not (mr/validate ::data-apps.schema/slug slug)
                        (throw (ex-info (tru "Pass a slug: \"{0}\" is not a valid one." slug) {:status-code 400})))
        app-id        (u/generate-nano-id)
        collection-id (u/generate-nano-id)
        collection    {:name        (str "Data App: " slug)
                       :namespace   "data-apps"
                       :entity_id   collection-id
                       :serdes/meta [{:model "Collection" :id collection-id
                                      :label (serialization/slugify-name (str "Data App: " slug))}]}
        app           (m/assoc-some {:version     data-app.config/supported-app-version
                                     :name        app-name
                                     :slug        slug
                                     :path        bundle-path
                                     :collection  collection-id
                                     :entity_id   app-id
                                     :serdes/meta [{:model "DataApp" :id app-id :label slug}]}
                                    :description description)]
    {:files [(file app nil)
             (file collection {collection-id [{:label (:name collection) :key collection-id}]})]}))
