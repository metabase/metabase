(ns metabase.geojson.settings
  (:require
   [clojure.java.io :as io]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.net InetAddress URL)))

(set! *warn-on-reflection* true)

(defsetting custom-geojson-enabled
  (deferred-tru "Whether or not the use of custom GeoJSON is enabled.")
  :visibility :admin
  :export?    true
  :type       :boolean
  :default    true
  :audit      :getter)

(defsetting default-maps-enabled
  (deferred-tru "Whether or not the default GeoJSON maps are enabled.")
  :visibility :admin
  :export?    true
  :type       :boolean
  :default    true
  :audit      :getter)

(defn builtin-geojson
  "Default GeoJSON maps when [[default-maps-enabled]]."
  []
  (if (default-maps-enabled)
    {:us_states       {:name        "United States"
                       :url         "app/assets/geojson/us-states.json"
                       :region_key  "STATE"
                       :region_name "NAME"
                       :builtin     true}
     :world_countries {:name        "World"
                       :url         "app/assets/geojson/world.json"
                       :region_key  "ISO_A2"
                       :region_name "NAME"
                       :builtin     true}}
    {}))

(def ^:private CustomGeoJSON
  [:map-of :keyword [:map {:closed true}
                     [:name                         ms/NonBlankString]
                     [:url                          ms/NonBlankString]
                     [:region_key                   [:maybe :string]]
                     [:region_name                  [:maybe :string]]
                     [:builtin     {:optional true} :boolean]]])

(def ^:private CustomGeoJSONValidator (mr/validator CustomGeoJSON))

(defn invalid-location-msg
  "Error message when a GeoJSON URL is invalid."
  []
  (str (tru "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to a file on the classpath.")
       " "
       (tru "URLs referring to hosts that supply internal hosting metadata are prohibited.")))

(def ^:private invalid-hosts
  #{"metadata.google.internal"}) ; internal metadata for GCP

(defn- valid-host?
  [^URL url]
  (let [host (.getHost url)
        host->url (fn [host] (URL. (str "http://" host)))
        base-url  (host->url (.getHost url))]
    (and (not-any? (fn [invalid-url] (.equals ^URL base-url invalid-url))
                   (map host->url invalid-hosts))
         (not (.isLinkLocalAddress (InetAddress/getByName host))))))

(defn- valid-protocol?
  [^URL url]
  (#{"http" "https"} (.getProtocol url)))

(defn- valid-url?
  [url-string]
  (try
    (let [url (URL. url-string)]
      (and (valid-protocol? url)
           (valid-host? url)))
    (catch Throwable e
      (throw (ex-info (invalid-location-msg) {:status-code 400, :url url-string} e)))))

(defn valid-geojson-url?
  "Whether GeoJSON `url` points to a valid resource. Does not check whether the contents are valid GeoJSON or not."
  [url]
  (or (io/resource url)
      (valid-url? url)))

(defn- valid-geojson-urls?
  [geojson]
  (every? (fn [[_ {:keys [url]}]] (valid-geojson-url? url))
          geojson))

(defn- entries-with-new-or-changed-urls
  "Returns a subset of `new-geojson` containing only entries whose URL is new or different from the stored value.
  This allows us to skip re-validating URLs that were previously saved and haven't changed."
  [new-geojson current-geojson]
  (into {}
        (filter (fn [[k {:keys [url]}]]
                  (let [current-url (get-in current-geojson [k :url])]
                    (not= url current-url)))
                new-geojson)))

(defn- validate-geojson
  "Throws a 400 if the supplied `geojson` is poorly structured or has an illegal URL/path.
  Validates structure of all entries, but only validates URLs for entries in `entries-to-validate-urls`.
  If `entries-to-validate-urls` is nil, validates URLs for all entries."
  [geojson entries-to-validate-urls]
  (when-not (CustomGeoJSONValidator geojson)
    (throw (ex-info (tru "Invalid custom GeoJSON") {:status-code 400})))
  (when (seq entries-to-validate-urls)
    (or (valid-geojson-urls? entries-to-validate-urls)
        (throw (ex-info (invalid-location-msg) {:status-code 400})))))

(defsetting custom-geojson
  (deferred-tru "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.")
  :encryption :no
  :type       :json
  :getter     (fn [] (merge (setting/get-value-of-type :json :custom-geojson) (builtin-geojson)))
  :setter     (fn [new-value]
                ;; remove the built-in keys you can't override them and we don't want those to be subject to validation.
                (let [new-value      (not-empty (reduce dissoc new-value (keys (builtin-geojson))))
                      current-value  (setting/get-value-of-type :json :custom-geojson)
                      ;; Only validate URLs for entries that are new or have changed URLs.
                      changed-entries (when new-value
                                        (entries-with-new-or-changed-urls new-value current-value))]
                  (when new-value
                    (validate-geojson new-value changed-entries))
                  (setting/set-value-of-type! :json :custom-geojson new-value)))
  :visibility :public
  :export?    true
  :audit      :raw-value)
