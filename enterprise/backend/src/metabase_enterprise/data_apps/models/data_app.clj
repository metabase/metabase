(ns metabase-enterprise.data-apps.models.data-app
  (:require
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.dependencies :as data-apps.dependencies]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.collections.models.collection :as collection]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.default-fields :as t2.default-fields])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.sql Blob)
   (org.apache.commons.codec.binary Hex)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/DataApp [_model] :data_app)

(defn- blob->bytes ^bytes [v]
  (cond
    (nil? v)           nil
    (instance? Blob v) (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    :else              v))

(def ^:private transform-bundle
  "Coerce JDBC `Blob` values into plain byte arrays on read."
  {:in  identity
   :out blob->bytes})

(t2/deftransforms :model/DataApp
  {:bundle        transform-bundle
   ;; JSON array of origins the sandboxed bundle may fetch/XHR (see config.clj).
   :allowed_hosts mi/transform-json})

(doto :model/DataApp
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2.default-fields/define-default-fields :model/DataApp
  data-apps.db/non-blob-columns)

(events/derive! ::event :metabase/event)
(doseq [e [:event/data-app-create :event/data-app-update :event/data-app-delete]]
  (events/derive! e ::event))

(defn- bytes-hash ^String [^bytes b]
  (let [^MessageDigest md (MessageDigest/getInstance "SHA-256")]
    (Hex/encodeHexString ^bytes (.digest md b))))

(defn- with-bundle-hash
  "The `row` with `bundle_hash` matching the `bundle` it sets."
  [row]
  (cond-> row
    (contains? row :bundle) (assoc :bundle_hash (some-> ^bytes (:bundle row) bytes-hash))))

(t2/define-before-insert :model/DataApp
  [data-app]
  (with-bundle-hash data-app))

(t2/define-before-update :model/DataApp
  [data-app]
  (let [changes (t2/changes data-app)]
    (when (and (contains? changes :resource_collection_id)
               (some? (:resource_collection_id (t2/original data-app))))
      (throw (ex-info (tru "A data app''s resource collection cannot be changed.")
                      {:status-code 400, :data-app-id (:id data-app)})))
    (when (contains? changes :bundle_hash)
      (throw (ex-info (tru "A data app''s bundle hash is computed from its bundle.")
                      {:status-code 400, :data-app-id (:id data-app)})))
    (merge data-app (some-> changes with-bundle-hash))))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))))

(methodical/defmethod t2/batched-hydrate [:model/DataApp :can_read]
  "Whether the current user can read each of `apps`, the apps a non-superuser reads loaded once."
  [_model k apps]
  (let [feature?  (premium-features/has-feature? :data-apps)
        readable  (when (and feature? (not api/*is-superuser?*) api/*current-user-id* (some some? apps))
                    (into #{} (map :id) (data-apps.db/readable-data-apps api/*current-user-id* false)))]
    (for [app apps]
      (when app
        (vary-meta app assoc k (boolean (and feature?
                                             (or api/*is-superuser?*
                                                 (contains? readable (:id app))))))))))

(methodical/defmethod t2/batched-hydrate [:model/DataApp :can_write]
  "Whether the current user can write each of `apps`, one answer for all of them: a superuser on an instance that is not
  read-only."
  [_model k apps]
  (let [writable? (boolean (and api/*is-superuser?* (not (remote-sync/read-only?))))]
    (for [app apps]
      (when app
        (assoc app k writable?)))))

(defn- enabled-change-writable?
  "Whether the current user can apply `changes` that only enable or disable an app, which a read-only instance still
  accepts as `enabled` is not synced."
  [changes]
  (boolean (and api/*is-superuser?*
                (every? #{:enabled} (keys changes)))))

(defmethod mi/can-update? :model/DataApp
  [_app changes]
  (enabled-change-writable? changes))

(methodical/defmethod mi/to-json :model/DataApp
  "Never include the raw bundle bytes in JSON."
  [data-app json-generator]
  (next-method (dissoc data-app :bundle) json-generator))

(defn- bundle->file
  "The `bundle` bytes as the text of its file."
  [^bytes bundle]
  (String. bundle StandardCharsets/UTF_8))

(defn file->bundle
  "The `content` of a bundle file as the bytes the app is served."
  ^bytes [^String content]
  (.getBytes content StandardCharsets/UTF_8))

(defn- entity-bundle-path
  "The bundle path of `entity`, a data app entity."
  [entity]
  (:path entity))

(defn- export-bundles
  "Exports the `bundles` of data `apps` as the files at their bundle paths."
  [_store apps bundles _opts]
  (mapv (fn [app bundle]
          (when bundle
            {(:bundle_path app) (bundle->file bundle)}))
        apps
        bundles))

(defn- import-bundles
  "Imports the bundles of data app `entities` from the `files` at their bundle paths."
  [_store entities files _opts]
  (mapv (fn [app files]
          (let [path (entity-bundle-path app)]
            (file->bundle
             (or (get files path)
                 (throw (ex-info (tru "Bundle file \"{0}\" not found." path)
                                 {:status-code 400}))))))
        entities
        files))

(defn- storage-paths
  "The storage path of each of the DataApp `entities`, in the apps directory by slug."
  [entities _ctx]
  (mapv (fn [app]
          [{:label data-app.config/apps-dir}
           {:label (:slug app) :key (:entity_id app) :style :slug}
           {:label "data_app"}])
        entities))

(defn- resource-paths
  "The bundle file stored next to the file of the DataApp `entity`."
  [entity]
  [(entity-bundle-path entity)])

(defn- import-dependencies
  "The resource Collection each of the DataApp `entities` depends on, if any."
  [entities]
  (mapv (fn [{:keys [collection resource_collection_id]}]
          (when-let [collection-entity-id (or collection resource_collection_id)]
            [[:model/Collection collection-entity-id]]))
        entities))

(defenterprise data-app-collection-ids
  "The resource collections of the data apps, which hold the copies an app runs."
  :feature :none
  []
  (data-apps.db/resource-collection-ids))

(defenterprise data-app-collection?
  "Whether `collection`, a Collection id or a row with its `:namespace`, is in the data-apps namespace, which holds only
  data apps' collections; asked of the namespace, not of the apps, since a load may write a collection's content before
  the app that owns it."
  :feature :none
  [collection]
  (if (map? collection)
    (= "data-apps" (some-> (:namespace collection) name))
    (data-apps.db/data-apps-namespace-collection? collection)))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-resource-collections
  "Throw a 400 unless each Collection of `collection-id->app-id`, a map from a Collection id to the id of the data app
  that gets it as its resource collection, nil for a new app, satisfies these rules:

  - it is in the data-apps namespace
  - it is a top-level collection
  - it is not archived, or the sample collection
  - it is not personal, official, typed or archived by an operation
  - no other data app has it

  A Collection that does not exist is left to the foreign key of `resource_collection_id`."
  [collection-id->app-id]
  (when (seq collection-id->app-id)
    (let [collection-ids     (vec (keys collection-id->app-id))
          id->collection     (data-apps.db/resource-collections-by-ids collection-ids)
          collection-id->ids (data-apps.db/data-app-ids-by-collection-ids collection-ids)]
      (doseq [[collection-id app-id] collection-id->app-id
              :let                   [collection (id->collection collection-id)]]
        (when-not (or (nil? collection)
                      (and (= "data-apps" (some-> (:namespace collection) name))
                           (= "/" (:location collection))
                           (not-any? collection [:personal_owner_id :authority_level :type :archive_operation_id])
                           (not-any? collection [:archived :is_sample])))
          (throw (ex-info (tru "A data app''s collection must be a top-level collection of data apps that isn''t archived or official. Give the app a collection of its own.")
                          {:status-code 400, :collection-id collection-id})))
        (when (seq (disj (collection-id->ids collection-id #{}) app-id))
          (throw (ex-info (tru "This collection already belongs to another data app. Give the app a collection of its own.")
                          {:status-code 400, :collection-id collection-id})))))))

(defn- check-shared-resource-collection
  "Throw a 400 when two of `collection-ids`, the resource collections that the apps of one batch get, are the same."
  [collection-ids]
  (when-not (apply distinct? (or (seq collection-ids) [nil]))
    (throw (ex-info (tru "This collection already belongs to another data app. Give the app a collection of its own.")
                    {:status-code 400}))))

(defn- check-new-data-apps
  "Throw a 400 unless the resource collections that the new `apps` come with satisfy these rules:

  - no two apps share one
  - each can be a resource collection, see [[check-resource-collections]]"
  [apps]
  (let [collection-ids (keep :resource_collection_id apps)]
    (check-shared-resource-collection collection-ids)
    (check-resource-collections (zipmap collection-ids (repeat nil)))))

(defn- create-resource-collections!
  "Create a resource collection, named after the slug, for each of `apps` that has none, and return the apps with it."
  [apps]
  (let [without          (filterv (comp nil? :resource_collection_id) apps)
        slug->collection (zipmap (map :slug without)
                                 (when (seq without)
                                   (map :id (collection/create-collections!
                                             (mapv (fn [{:keys [slug]}]
                                                     {:name      (data-apps.db/resource-collection-name slug)
                                                      :namespace "data-apps"})
                                                   without)))))]
    (mapv #(cond-> % (nil? (:resource_collection_id %)) (assoc :resource_collection_id (slug->collection (:slug %))))
          apps)))

(defn- prepare-new-data-apps!
  "Check the new `apps` and return them with a resource collection for each that has none."
  [apps]
  (check-new-data-apps apps)
  (create-resource-collections! apps))

(mu/defn create-data-apps! :- [:sequential ::data-apps.schema/data-app]
  "Insert `apps` in one transaction, publishing their create event, and return the inserted DataApps, each app without
  a resource collection getting one named after its slug."
  [apps :- [:sequential ::data-apps.schema/data-app.create]]
  (app-db/create-batched! :model/DataApp apps
                          {:before-create prepare-new-data-apps!
                           :after-create  #(events/publish-event! :event/data-app-create (events/create-event %))}))

(defn- without-held-bundles
  "The `updates` of an import without the bundle that the stored app of the row already holds."
  [updates id->stored]
  (mapv (fn [{:keys [id bundle] :as row}]
          (cond-> row
            (some-> ^bytes bundle bytes-hash (= (:bundle_hash (id->stored id)))) (dissoc :bundle)))
        updates))

(defn- check-data-app-updates
  "Throw a 400 unless the apps of `updates` that get their first resource collection satisfy these rules:

  - no two apps share one
  - each can be a resource collection, see [[check-resource-collections]]"
  [updates id->stored]
  (let [first-collections (filterv (fn [{:keys [id resource_collection_id]}]
                                     (and resource_collection_id (nil? (:resource_collection_id (id->stored id)))))
                                   updates)]
    (check-shared-resource-collection (map :resource_collection_id first-collections))
    (check-resource-collections (into {} (map (juxt :resource_collection_id :id)) first-collections))))

(mu/defn update-data-apps! :- :nil
  "Apply `updates`, each the `:id` of a DataApp and the columns to change, in one transaction, publishing their update
  event, and with `:writer :import` leaving out a bundle that the stored app already holds."
  ([updates :- [:sequential ::data-apps.schema/data-app.update]]
   (update-data-apps! updates nil))
  ([updates :- [:sequential ::data-apps.schema/data-app.update]
    opts    :- :metabase.events.schema/write-opts]
   (app-db/update-batched! :model/DataApp updates
                           {:before-update (fn [updates id->stored]
                                             (check-data-app-updates updates id->stored)
                                             (cond-> updates
                                               (= :import (:writer opts)) (without-held-bundles id->stored)))
                            :reread?       true
                            :after-update  (fn [updates id->stored id->updated]
                                             (events/publish-event! :event/data-app-update
                                                                    (events/update-event id->stored updates {:objects id->updated})))})))

(defn- delete-resource-collections!
  "Delete the resource collections of `apps`, with the grants on them; the hooks of a collection delete what it holds."
  [apps]
  (when-let [collection-ids (seq (keep :resource_collection_id apps))]
    (collection/delete-collections! (vec collection-ids))))

(mu/defn delete-data-apps! :- :nil
  "Delete the DataApps with `ids` in one transaction, each after its resource collection, publishing their delete
  event."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/DataApp ids
                          {:before-delete (fn [apps]
                                            (delete-resource-collections! apps)
                                            (events/publish-event! :event/data-app-delete (events/delete-event apps)))}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataApp [_model]
  {:skip? true})

(defn- default-versions
  "The load `items` of data apps, each with version 1 when its file declares none."
  [items]
  (mapv #(update-in % [:row :version] (fnil identity 1)) items))

(defmethod serialization/spec :model/DataApp [_]
  {:schema              ::data-apps.schema/external-data-app
   :copy                [:entity_id :slug :name :description :version :allowed_hosts]
   :skip                [:enabled :bundle_hash]
   :transform           {:resource_collection_id (assoc (serialization/fk-transform :model/Collection) :as :collection)
                         :bundle_path            {:as     :path
                                                  :export serialization/export-unchanged
                                                  :import serialization/import-unchanged}
                         :bundle                 {:as     :serdes/resources
                                                  :export export-bundles
                                                  :import import-bundles}}
   :before-load         default-versions
   :insert!             create-data-apps!
   :update!             #(do (update-data-apps! % {:writer :import}) %)
   :delete!             delete-data-apps!
   :storage-paths       storage-paths
   :resource-paths      resource-paths
   :import-dependencies import-dependencies})

(defmethod remote-sync/spec :model/DataApp
  [_model]
  {:name         :slug
   :synced-items data-apps.db/synced-data-app-items})

(defmethod search/spec :model/DataApp
  [_model]
  {"data-app"
   {:attrs        {:archived      false
                   :collection-id false
                   :created-at    true
                   :updated-at    true}
    :search-terms [:slug :name :description]
    ;; A result's `name` can be its display name, and the app's URL needs its slug.
    :render-terms {:data-app-slug :slug}}})

(defmethod dependencies/spec :model/DataApp [_model]
  {:type  :data-app
   :items data-apps.db/dependency-data-app-items

   :hydrate      data-apps.dependencies/hydrate
   :dependencies data-apps.dependencies/dependencies

   :dependency-columns #{:resource_collection_id}})
