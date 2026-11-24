(ns metabase-enterprise.custom-viz-plugin.serialization
  "The SerDes of CustomVizPlugins, which carry their bundles base64-encoded."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]))

(set! *warn-on-reflection* true)

(defn- bundle->b64 ^String [^bytes b]
  (some-> b codecs/bytes->b64-str))

(defn- b64->bundle ^bytes [^String s]
  (some-> s codecs/b64->bytes))

(defn- export-bundles
  "Exports the `bundles` of CustomVizPlugins base64-encoded."
  [_store _batch bundles _opts]
  (mapv bundle->b64 bundles))

(defn- import-bundles
  "Imports the base64-`encoded` bundles of CustomVizPlugins."
  [_store _batch encoded _opts]
  (mapv b64->bundle encoded))

(def bundle-transform
  "The transform of the `bundle` of CustomVizPlugins."
  {:export export-bundles
   :import import-bundles})

(defn rows-by-refs
  "The map from each of `identifiers` to the oldest CustomVizPlugin with that identifier, with only `columns` unless
  nil."
  [identifiers columns]
  (let [identifiers (filterv some? identifiers)
        rows        (when (seq identifiers)
                      (custom-viz-plugin.db/plugins-by-identifiers
                       identifiers
                       (some->> columns (concat [:id :identifier]) distinct vec)))]
    (reduce (fn [found {:keys [identifier] :as row}]
              (cond-> found
                (not (contains? found identifier)) (assoc identifier row)))
            {}
            rows)))

(defn- bundle-columns
  "Columns derived from validating the imported `bundle` bytes against the imported `identifier`: the `:active` state
  plus manifest-derived metadata when the bundle is valid and named for this plugin, or the `:error` state with the
  reason when it is not. The same checks guard a bundle upload."
  [{:keys [identifier bundle]}]
  (try
    (->> (cache/validate-bundle! bundle)
         (cache/check-bundle-identifier! identifier)
         cache/derived-columns)
    (catch Exception e
      {:status        :error
       :error_message (ex-message e)})))

(defn storage-paths
  "The storage path of each of the CustomVizPlugin `entities`, under `custom_viz_plugins/` by identifier."
  [entities _ctx]
  (mapv (fn [entity]
          [{:label "custom_viz_plugins"} {:label (:identifier entity)}])
        entities))

(defn before-load
  "The CustomVizPlugin load `items` without the bundles their local rows already hold, the others with the columns
  their bundles derive."
  [items]
  (mapv (fn [{:keys [row local] :as item}]
          (if (and local (some-> ^bytes (:bundle row) cache/bytes-hash (= (:bundle_hash local))))
            (update item :row dissoc :bundle)
            (update item :row #(merge % (bundle-columns %)))))
        items))

(defn after-load
  "Purges the cache of the CustomVizPlugins the `items` update."
  [items]
  (doseq [{:keys [local]} items
          :when local]
    (cache/purge-plugin-cache! {:id (:id local)})))
