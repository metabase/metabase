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
  (prepare ::data-apps.schema/data-app.insert data-app))

(t2/define-before-update :model/DataApp
  [data-app]
  (merge data-app (some->> (t2/changes data-app) (prepare ::data-apps.schema/data-app.update))))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))
    (contains? app :table_ids)     (update :table_ids #(or % []))))

;; Deliberately ungated: any signed-in user may view a data app, and the `+auth`
;; endpoints mean reaching a read check already implies authentication. See the
;; README's permissions section for why this is safe.
(defmethod mi/can-read? :model/DataApp
  ([_instance]   true)
  ([_model _pk]  true))

(defmethod mi/can-write? :model/DataApp
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-create? :model/DataApp
  [_model _instance]
  api/*is-superuser?*)

(t2/define-after-insert :model/DataApp
  [app]
  ;; The permission group is the app's own; its resource collection comes with it from the repository, or is created
  ;; for an app made through the API (see `metabase-enterprise.data-apps.apps`).
  (merge app (data-app.resources/ensure-resources! app {:create-collection? false})))

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
               :draft :bundle_hash
               ;; server-managed, recreated on import; the tables are recomputed from the resources after it
               :permission_group_id :table_ids]
   :transform {:created_at   (serdes/date)
               ;; the app's resource collection, `resources/collection.yaml` beside the manifest, which the app
               ;; depends on and so loads after
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
  (eduction (remove :draft)
            (data-apps.db/reducible-data-apps-with-bundles filter-column filter-ids
                                                           (serdes/extract-order-columns model-name opts))))

(defmethod serdes/deserialization-dependencies "DataApp" [{:keys [collection]}]
  ;; The resource collection the manifest names loads first, so the app links to it as it lands.
  (when collection
    [[{:model "Collection" :id collection}]]))

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
  (let [local    (or maybe-local (data-apps.db/draft-by-slug (:slug ingested)))
        app      (serdes/default-load-one! ingested local)
        previous (:resource_collection_id local)]
    (data-apps.db/update-data-app! (:id app) {:draft false})
    ;; The collection is the manifest's, loaded before the app; none means the app isn't published yet.
    (data-app.resources/ensure-resources! app {:create-collection? false})
    ;; A manifest naming a new collection leaves the previous one owned by nothing: delete it with its copies.
    (when (and previous (not= previous (:resource_collection_id app)))
      (data-apps.db/delete-resource-collection! previous))
    app))

(defenterprise data-app-group-ids
  "The data-app permission groups (those flagged `is_data_app_group`). SSO group sync must never touch
   their membership."
  :feature :none
  []
  (data-apps.db/data-app-group-ids))
