(ns metabase.api.geojson
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [malli.core :as mc]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [ring.util.response :as response])
  (:import
   (java.io BufferedReader)
   (java.net InetAddress URL)
   (org.apache.commons.io.input ReaderInputStream)))

(set! *warn-on-reflection* true)

(defsetting custom-geojson-enabled
  (deferred-tru "Whether or not the use of custom GeoJSON is enabled.")
  :visibility :admin
  :export?    true
  :type       :boolean
  :setter     :none
  :default    true
  :audit      :getter)

(def ^:private CustomGeoJSON
  [:map-of :keyword [:map {:closed true}
                     [:name                         ms/NonBlankString]
                     [:url                          ms/NonBlankString]
                     [:region_key                   [:maybe :string]]
                     [:region_name                  [:maybe :string]]
                     [:builtin     {:optional true} :boolean]]])

(def ^:private CustomGeoJSONValidator (mc/validator CustomGeoJSON))

(defsetting default-maps-enabled
  (deferred-tru "Whether or not the default GeoJSON maps are enabled.")
  :visibility :admin
  :export?    true
  :type       :boolean
  :setter     :none
  :default    true
  :audit      :getter)

(defn- builtin-geojson
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

(defn- invalid-location-msg []
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

(defn- valid-geojson-url?
  [url]
  (or (io/resource url)
      (valid-url? url)))

(defn- valid-geojson-urls?
  [geojson]
  (every? (fn [[_ {:keys [url]}]] (valid-geojson-url? url))
          geojson))

(defn- validate-geojson
  "Throws a 400 if the supplied `geojson` is poorly structured or has an illegal URL/path"
  [geojson]
  (when-not (CustomGeoJSONValidator geojson)
    (throw (ex-info (tru "Invalid custom GeoJSON") {:status-code 400})))
  (or (valid-geojson-urls? geojson)
      (throw (ex-info (invalid-location-msg) {:status-code 400}))))

(defsetting custom-geojson
  (deferred-tru "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.")
  :type    :json
  :getter  (fn [] (merge (setting/get-value-of-type :json :custom-geojson) (builtin-geojson)))
  :setter  (fn [new-value]
             ;; remove the built-in keys you can't override them and we don't want those to be subject to validation.
             (let [new-value (not-empty (reduce dissoc new-value (keys (builtin-geojson))))]
               (when new-value
                 (validate-geojson new-value))
               (setting/set-value-of-type! :json :custom-geojson new-value)))
  :visibility :public
  :export?    true
  :audit      :raw-value)

(def ^:private connection-timeout-ms 8000)

(defn- url->geojson
  [url]
  (let [resp (try (http/get url {:as                 :reader
                                 :redirect-strategy  :none
                                 :socket-timeout     connection-timeout-ms
                                 :connection-timeout connection-timeout-ms
                                 :throw-exceptions   false})
                  (catch Throwable _
                    (throw (ex-info (tru "GeoJSON URL failed to load") {:status-code 400}))))
        success? (<= 200 (:status resp) 399)
        allowed-content-types #{"application/geo+json"
                                "application/vnd.geo+json"
                                "application/json"
                                "text/plain"}
        ok-content-type? (some #(str/starts-with? (get-in resp [:headers :content-type]) %)
                               allowed-content-types)]
    (cond
      (not success?)
      (throw (ex-info (tru "GeoJSON URL failed to load") {:status-code 400}))

      (not ok-content-type?)
      (throw (ex-info (tru "GeoJSON URL returned invalid content-type") {:status-code 400}))

      :else (:body resp))))

(defn- url->reader [url]
  (if-let [resource (io/resource url)]
    (io/reader resource)
    (url->geojson url)))

(defn- read-url-and-respond
  "Reads the provided URL and responds with the contents as a stream."
  [url respond]
  (with-open [^BufferedReader reader (url->reader url)
              is                     (ReaderInputStream. reader)]
    (respond (-> (response/response is)
                 (response/content-type "application/json")))))

(api/defendpoint-async GET "/:key"
  "Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the
  file specified for `key`)."
  [{{:keys [key]} :params} respond raise]
  {key ms/NonBlankString}
  (when-not (or (custom-geojson-enabled) ((builtin-geojson) (keyword key)))
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (if-let [url (get-in (custom-geojson) [(keyword key) :url])]
    (try
      (read-url-and-respond url respond)
      (catch Throwable e
        (raise e)))
    (raise (ex-info (tru "Invalid custom GeoJSON key: {0}" key) {:status-code 400}))))

(api/defendpoint-async GET "/"
  "Load a custom GeoJSON file based on a URL or file path provided as a query parameter.
  This behaves similarly to /api/geojson/:key but doesn't require the custom map to be saved to the DB first."
  [{{:keys [url]} :params} respond raise]
  {url ms/NonBlankString}
  (validation/check-has-application-permission :setting)
  (when-not (custom-geojson-enabled)
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (let [decoded-url (codec/url-decode url)]
    (try
      (when-not (valid-geojson-url? decoded-url)
        (throw (ex-info (invalid-location-msg) {:status-code 400})))
      (read-url-and-respond decoded-url respond)
      (catch Throwable e
        (raise e)))))

(api/define-routes)
