(ns metabase-enterprise.data-apps.models.data-app
  (:require
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.users.models.user :as user]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
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
   :allowed_hosts mi/transform-json
   :table_ids     mi/transform-json})

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

(defn- prepare
  "The DataApp `row` normalized and validated against `schema`, with the hash of any bundle it sets."
  [schema row]
  (->> row
       (lib/normalize schema)
       (mu/validate-throw schema)
       with-bundle-hash))

(t2/define-before-insert :model/DataApp
  [data-app]
  ;; Every app owns a resource collection from its first moment: one it is given (an import names the collection
  ;; its manifest references) or one created here, so the column is never null.
  (let [row (prepare ::data-apps.schema/data-app.insert data-app)]
    (cond-> row
      (nil? (:resource_collection_id row))
      (assoc :resource_collection_id (:id (data-app.resources/create-resource-collection! row))))))

(t2/define-before-update :model/DataApp
  [data-app]
  (let [changes (t2/changes data-app)]
    ;; A missing collection (the column is nullable, so the row survives its collection's deletion) may be set
    ;; again; one the app has is never replaced or cleared.
    (when (and (contains? changes :resource_collection_id)
               (some? (:resource_collection_id (t2/original data-app))))
      (throw (ex-info (tru "A data app''s resource collection cannot be changed.")
                      {:status-code 400, :data-app-id (:id data-app)})))
    (merge data-app (some->> changes (prepare ::data-apps.schema/data-app.update)))))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))
    (contains? app :table_ids)     (update :table_ids #(or % []))))

(defmethod mi/can-read? :model/DataApp
  ([app] (mi/can-read? :model/DataApp (:id app)))
  ([_model pk]
   (or api/*is-superuser?*
       (and api/*current-user-id*
            (nil? (:tenant_id @api/*current-user*))
            (let [group-ids (user/group-ids api/*current-user-id*)]
              (boolean (some (comp group-ids :permission_group_id)
                             (data-apps.db/app-assignments [pk]))))))))

(defmethod mi/can-write? :model/DataApp
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-create? :model/DataApp
  [_model _instance]
  api/*is-superuser?*)

(t2/define-after-insert :model/DataApp
  [app]
  (merge app (data-app.resources/ensure-resources! app)))

;; The collection goes first, while the row still references it: the reference is nullable so the database can clear
;; it, and the collection's own hooks delete what it holds and the grants on it.
(t2/define-before-delete :model/DataApp
  [app]
  (data-app.resources/delete-resources! app))

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

(defn- ingested-bundle-path
  "The normalized bundle path of the ingested data app `ingested`."
  [ingested]
  (lib/normalize ::data-apps.schema/bundle-path (:path ingested)))

(defmethod serdes/make-spec "DataApp"
  [_model-name _opts]
  {:copy      [:entity_id :description :version :allowed_hosts]
   :skip      [;; admin-owned state of this instance
               :enabled
               ;; set by the import itself
               :bundle_hash
               ;; server-managed resources, recreated on import
               :table_ids]
   :transform {:created_at   (serdes/date)
               ;; the app's resource collection, a collection in the `data-apps` namespace that loads before the app
               :resource_collection_id (assoc (serdes/fk :model/Collection) :as :collection)
               :name         {:as :slug :export identity :import identity}
               :display_name {:as :name :export identity :import identity}
               :bundle_path  {:as :path :export identity :import identity}
               :bundle       {:as                  :serdes/resources
                              :export-with-context (fn [app _k bundle]
                                                     (if bundle
                                                       {(:bundle_path app) (bundle->file bundle)}
                                                       ::serdes/skip))
                              :import-with-context (fn [ingested _k files]
                                                     (let [path (ingested-bundle-path ingested)]
                                                       (file->bundle
                                                        (or (get files path)
                                                            (throw (ex-info (tru "Bundle file \"{0}\" not found." path)
                                                                            {:status-code 400}))))))}}
   :defaults  {:description nil :version 1 :allowed_hosts []}})

(defmethod serdes/extract-query "DataApp"
  [model-name {:keys [filter-column filter-ids] :as opts}]
  (data-apps.db/reducible-data-apps-with-bundles filter-column filter-ids
                                                 (serdes/extract-order-columns model-name opts)))

(defmethod serdes/deserialization-dependencies "DataApp" [{:keys [collection resource_collection_id]}]
  ;; The resource collection the manifest names loads first, so the app links to it as it lands. A manifest names it
  ;; as `collection`; serialization's own checks ask by the column.
  (when-let [collection-entity-id (or collection resource_collection_id)]
    [[{:model "Collection" :id collection-entity-id}]]))

(defmethod serdes/descendants "DataApp" [_model-name id _opts]
  ;; An app's resource collection, and through it the copies it holds, travel with the app.
  (when-let [collection-id (data-apps.db/resource-collection-id id)]
    {["Collection" collection-id] {"DataApp" id}}))

(defmethod serdes/storage-path "DataApp" [app _ctx]
  [{:label data-app.config/apps-dir}
   {:label (:slug app) :key (:entity_id app) :style :slug}
   {:label "data_app"}])

(defmethod serdes/resource-paths "DataApp" [ingested]
  [(ingested-bundle-path ingested)])

(defmethod serdes/load-one! "DataApp"
  [ingested maybe-local]
  ;; an app made on the instance keeps its slug: the unique index would refuse the insert anyway, but with an error
  ;; that doesn't say what to do
  (when (and (nil? maybe-local) (data-apps.db/data-app-exists? (:slug ingested)))
    (throw (ex-info (tru "A data app named \"{0}\" already exists on this instance. Delete it, or give the app in the repository another slug."
                         (:slug ingested))
                    {:status-code 400})))
  (let [app (serdes/default-load-one! ingested maybe-local)]
    (when maybe-local
      (data-app.resources/ensure-resources! app))
    app))

(defenterprise data-app-collection-ids
  "The resource collections of the data apps, which hold the copies an app runs."
  :feature :none
  []
  (data-apps.db/resource-collection-ids))

(defenterprise data-app-collection?
  "Whether the Collection with `collection-id` is a data app's resource collection."
  :feature :none
  [collection-id]
  (data-apps.db/resource-collection? collection-id))
