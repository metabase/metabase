(ns metabase.api.geojson
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [compojure.core :refer [GET]]
            [metabase.api.common :refer [defendpoint define-routes]]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :refer [tru]]
            [ring.util.response :as rr]
            [schema.core :as s])
  (:import org.apache.commons.io.input.ReaderInputStream))

(def ^:private ^:const ^Integer geojson-fetch-timeout-ms
  "Number of milliseconds we have to fetch (and parse, if applicable) a GeoJSON file before we consider the request to
  have timed out."
  (int (* 60 1000)))

(defn- valid-json?
  "Does this URL-OR-RESOURCE point to valid JSON?
  URL-OR-RESOURCE should be something that can be passed to `slurp`, like an HTTP URL or a `java.net.URL` (which is
  what `io/resource` returns below)."
  [url-or-resource]
  (u/with-timeout geojson-fetch-timeout-ms
    (dorun (json/parse-stream (io/reader url-or-resource))))
  true)

(defn- valid-json-resource?
  "Does this RELATIVE-PATH point to a valid local JSON resource? (RELATIVE-PATH is something like
  \"app/assets/geojson/us-states.json\".)"
  [relative-path]
  (when-let [^java.net.URI uri (u/ignore-exceptions (java.net.URI. relative-path))]
    (when-not (.isAbsolute uri)
      (valid-json? (io/resource (str "frontend_client/" uri))))))

(defn- valid-json-url?
  "Is URL a valid HTTP URL and does it point to valid JSON?"
  [url]
  (when (u/url? url)
    (valid-json? url)))

(def ^:private valid-json-url-or-resource?
  "Check that remote URL points to a valid JSON file, or throw an exception.
   Since the remote file isn't likely to change, this check isn't repeated for URLs that have already succeded;
   if the check fails, an exception is thrown (thereby preventing memoization)."
  (memoize (fn [url-or-resource-path]
             (or (valid-json-url? url-or-resource-path)
                 (valid-json-resource? url-or-resource-path)
                 (throw (Exception. (str (tru "Invalid JSON URL or resource: {0}" url-or-resource-path))))))))

(def ^:private CustomGeoJSON
  {s/Keyword {:name                     s/Str
              :url                      (s/constrained
                                         s/Str
                                         valid-json-url-or-resource?
                                         "URL must point to a valid JSON file.")
              :region_key               (s/maybe s/Str)
              :region_name              (s/maybe s/Str)
              (s/optional-key :builtin) s/Bool}})

(def ^:private ^:const builtin-geojson
  {:us_states       {:name        "United States"
                     :url         "app/assets/geojson/us-states.json"
                     :region_key  "name"
                     :region_name "name"
                     :builtin     true}
   :world_countries {:name        "World"
                     :url         "app/assets/geojson/world.json"
                     :region_key  "ISO_A2"
                     :region_name "NAME"
                     :builtin     true}})

(defsetting custom-geojson
  (tru "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.")
  :type    :json
  :default {}
  :getter  (fn [] (merge (setting/get-json :custom-geojson) builtin-geojson))
  :setter  (fn [new-value]
             (when new-value
               (s/validate CustomGeoJSON new-value))
             (setting/set-json! :custom-geojson new-value)))


(defendpoint GET "/:key"
  "Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the
  file specified for KEY)."
  [key]
  {key su/NonBlankString}
  (let [url (or (get-in (custom-geojson) [(keyword key) :url])
                (throw (ex-info (tru "Invalid custom GeoJSON key: {0}" key)
                         {:status-code 400})))]
    ;; TODO - it would be nice if we could also avoid returning our usual cache-busting headers with the response here
    (-> (rr/response (ReaderInputStream. (io/reader url)))
        (rr/content-type "application/json"))))


(define-routes)
