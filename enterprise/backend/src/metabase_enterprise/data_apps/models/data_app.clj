(ns metabase-enterprise.data-apps.models.data-app
  (:require
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.dependencies :as data-apps.dependencies]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
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
  (derive :hook/timestamped?)
  (derive :hook/events))

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

(defn- prepare
  "The DataApp `row` normalized and validated against `schema`."
  [schema row]
  (->> row
       (lib/normalize schema)
       (mu/validate-throw schema)
       with-bundle-hash))

(t2/define-before-insert :model/DataApp
  [data-app]
  (prepare ::data-apps.schema/data-app.create data-app))

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
    (merge data-app (some->> changes (prepare ::data-apps.schema/data-app.update)))))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))))

(methodical/defmethod t2/simple-hydrate [:model/DataApp :can_read]
  [_model k app]
  (vary-meta app assoc k
             (boolean
              (and (premium-features/has-feature? :data-apps)
                   (or api/*is-superuser?*
                       (and api/*current-user-id*
                            (data-apps.db/data-app-readable? api/*current-user-id* (:id app))))))))

(methodical/defmethod t2/simple-hydrate [:model/DataApp :can_write]
  [_model k app]
  (assoc app k
         (boolean
          (and api/*is-superuser?*
               (not (remote-sync/read-only?))))))

(defmethod mi/can-create? :model/DataApp
  [_model _instance]
  (and api/*is-superuser?*
       (not (remote-sync/read-only?))))

(defn- unsynced-change-writable?
  "Whether the current user can apply `changes` that touch no synced column of `app`, which a read-only instance still
  accepts."
  [app changes]
  (boolean (and api/*is-superuser?*
                (not (remote-sync/synced-changes? :model/DataApp app changes)))))

(defmethod mi/can-update? :model/DataApp
  [app changes]
  (or (mi/can-write? app)
      (unsynced-change-writable? app changes)))

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
  "The normalized bundle path of `entity`, a data app entity."
  [entity]
  (lib/normalize ::data-apps.schema/bundle-path (:path entity)))

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

(defn- check-resource-collections!
  "Throws unless each Collection of `collection-id->app-id`, a map from a Collection id to the id of the data app that
  gets it as its resource collection, nil for a new app, can be that: a top-level collection of data apps, not archived,
  official, typed or the sample, that no other app has; remote sync may sync it."
  [collection-id->app-id]
  (when (seq collection-id->app-id)
    (let [collection-ids (vec (keys collection-id->app-id))
          collections    (u/index-by :id (data-apps.db/resource-collections collection-ids))
          owners         (reduce (fn [acc {:keys [id resource_collection_id]}]
                                   (update acc resource_collection_id (fnil conj #{}) id))
                                 {}
                                 (data-apps.db/data-apps-with-collections collection-ids))]
      (doseq [[collection-id app-id] collection-id->app-id
              :let                   [collection (collections collection-id)]]
        (when-not (and collection
                       (= "data-apps" (some-> (:namespace collection) name))
                       (= "/" (:location collection))
                       (not-any? collection [:personal_owner_id :authority_level :type :archive_operation_id])
                       (not-any? collection [:archived :is_sample]))
          (throw (ex-info (tru "A data app''s collection must be a top-level collection of data apps that isn''t archived or official. Give the app a collection of its own.")
                          {:status-code 400, :collection-id collection-id})))
        (when (seq (disj (get owners collection-id #{}) app-id))
          (throw (ex-info (tru "This collection already belongs to another data app. Give the app a collection of its own.")
                          {:status-code 400, :collection-id collection-id})))))))

(mu/defn create-data-apps! :- [:sequential ::data-apps.schema/data-app]
  "Insert the DataApp `rows`, which the hooks of the model normalize and validate, and return the inserted apps. A row
  with a resource collection needs one that can be it; one without gets a collection of its own, named after its slug.
  Throws a 400 when two rows share a collection."
  [rows :- [:sequential :map]]
  (if (seq rows)
    (let [given (keep :resource_collection_id rows)]
      (when-not (apply distinct? (or (seq given) [nil]))
        (throw (ex-info (tru "This collection already belongs to another data app. Give the app a collection of its own.")
                        {:status-code 400})))
      (check-resource-collections! (zipmap given (repeat nil)))
      (events/with-batched-events
        (let [missing        (filterv (comp nil? :resource_collection_id) rows)
              new-collection (zipmap (map :slug missing)
                                     (when (seq missing)
                                       (data-apps.db/insert-resource-collections! (mapv :slug missing))))]
          (data-apps.db/insert-data-apps!
           (mapv #(cond-> % (nil? (:resource_collection_id %)) (assoc :resource_collection_id (new-collection (:slug %))))
                 rows)))))
    []))

(mu/defn update-data-apps! :- :nil
  "Apply the changes in `changes-by-id`, a map from the id of a DataApp to its changes, which the hooks of the model
  normalize and validate, in one batch of events, with one statement per distinct change set. Throws unless a new
  resource collection can be one."
  [changes-by-id :- [:map-of ms/PositiveInt :map]]
  (when (seq changes-by-id)
    (events/with-batched-events
      (let [stored (u/index-by :id (data-apps.db/data-apps-by-ids (vec (keys changes-by-id))))]
        (check-resource-collections!
         (into {}
               (keep (fn [[id changes]]
                       (when-let [collection-id (:resource_collection_id changes)]
                         (let [app (stored id)]
                           (when (and app (nil? (:resource_collection_id app)))
                             [collection-id id])))))
               changes-by-id))
        (doseq [[changes pairs] (group-by val changes-by-id)
                :when           (seq changes)]
          (data-apps.db/update-data-apps! (mapv key pairs) changes)))))
  nil)

(mu/defn delete-data-apps! :- :nil
  "Delete the DataApps with `data-app-ids`, each after its resource collection with the grants on it, in one batch of
  events. The collection's own hooks delete what it holds."
  [data-app-ids :- [:sequential ms/PositiveInt]]
  (when (seq data-app-ids)
    (events/with-batched-events
      (let [collection-ids (into [] (keep :resource_collection_id) (data-apps.db/data-apps-by-ids (vec data-app-ids)))]
        (when (seq collection-ids)
          (data-apps.db/delete-resource-collections! collection-ids)))
      (data-apps.db/delete-data-apps! (vec data-app-ids))))
  nil)

(defn- update-imported-data-apps!
  "Update the DataApps of an import with `rows`, each its id and changed columns, returning `rows`. A bundle the stored
  app already holds is not written again."
  [rows]
  (let [stored (u/index-by :id (when (seq rows) (data-apps.db/data-apps-by-ids (mapv :id rows))))]
    (update-data-apps!
     (into {}
           (map (fn [{:keys [id bundle] :as row}]
                  [id (cond-> (dissoc row :id)
                        (some-> ^bytes bundle bytes-hash (= (:bundle_hash (stored id)))) (dissoc :bundle))]))
           rows))
    rows))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/DataApp
  [_model]
  {:create :event/data-app-create
   :update :event/data-app-update
   :delete :event/data-app-delete})

(defmethod app-db-copy/spec :model/DataApp [_model]
  {:skip? true})

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
   :insert!             create-data-apps!
   :update!             update-imported-data-apps!
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
