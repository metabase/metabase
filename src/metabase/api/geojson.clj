(ns metabase.api.geojson
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util
             [i18n :as ui18n :refer [deferred-tru tru]]
             [schema :as su]]
            [ring.util.response :as rr]
            [schema.core :as s])
  (:import com.fasterxml.jackson.core.JsonParseException
           java.io.FileNotFoundException
           [java.net ConnectException NoRouteToHostException UnknownHostException]
           java.util.concurrent.TimeoutException
           org.apache.commons.io.input.ReaderInputStream))

(def ^:private ^:const ^Integer geojson-fetch-timeout-ms
  "Number of milliseconds we have to fetch (and parse, if applicable) a GeoJSON file before we consider the request to
  have timed out."
  (int (* 60 1000)))

(defn- valid-json?
  "Does this `url-or-resource` point to valid JSON? `url-or-resource` should be something that can be passed to `slurp`,
  like an HTTP URL or a `java.net.URL` (which is what `io/resource` returns below)."
  [url-or-resource]
  (try
    (u/with-timeout geojson-fetch-timeout-ms
      (with-open [reader (io/reader url-or-resource)]
        (dorun (json/parse-stream reader))))
    ;; `with-timeout` executes the body in a future. If an exception occurs, it will throw an ExcecutionException
    ;; which isn't very useful. The cause of the ExcutionException is what we want to propagate as that is something
    ;; that will be actionable by the user to fix
    (catch java.util.concurrent.ExecutionException e
      (throw (.getCause e))))
  true)

(defn- valid-json-resource-path-string?
  "Does this `relative-path` point to a valid local JSON resource? (`relative-path` is something like
  \"app/assets/geojson/us-states.json\".)"
  [^String relative-path]
  (when-let [^java.net.URI uri (u/ignore-exceptions (java.net.URI. relative-path))]
    (when-not (.isAbsolute uri)
      (let [relative-path-with-prefix (str "frontend_client/" uri)]
        (if-let [resource (io/resource relative-path-with-prefix)]
          (try
            (valid-json? resource)
            (catch JsonParseException e
              (throw (Exception. (tru "Unable to parse resource `{0}` as JSON" relative-path-with-prefix) e))))
          (throw (FileNotFoundException. (tru "Unable to find JSON via relative path `{0}`" relative-path-with-prefix))))))))

(defn- valid-json-url-string?
  "Is `url` a valid HTTP URL string and does it point to valid JSON?"
  [^String url]
  (when (u/url? url)
    (try
      (valid-json? url)
      ;; There could be many reasons why we are not able to use a URL as a GeoJSON source. The various catch clauses
      ;; below attempt to provide the user with more info around the failure so they can correct the issue and try
      ;; again.
      (catch TimeoutException e
        (throw (Exception. (tru "Connection to host timed out for URL `{0}`" url) e)))
      (catch UnknownHostException e
        (throw (Exception. (tru "Unable to connect to unknown host at URL `{0}`" url) e)))
      (catch NoRouteToHostException e
        (throw (Exception. (tru "Unable to connect to host at URL `{0}`" url) e)))
      (catch ConnectException e
        (throw (Exception. (tru "Connection refused by host for URL `{0}`" url) e)))
      (catch FileNotFoundException e
        (throw (Exception. (tru "Unable to retrieve resource at URL `{0}`" url) e)))
      (catch JsonParseException e
        (throw (Exception. (tru "Unable to parse resource at URL `{0}` as JSON" url) e))))))

(def ^:private ^{:arglists '([url-or-resource])} valid-json-url-or-resource?
  "Check that remote URL points to a valid JSON file, or throw an exception. Since the remote file isn't likely to
  change, this check isn't repeated for URLs that have already succeded; if the check fails, an exception is
  thrown (thereby preventing memoization)."
  (memoize (fn [url-or-resource-path]
             (or (valid-json-url-string? url-or-resource-path)
                 (valid-json-resource-path-string? url-or-resource-path)
                 (throw (Exception. (tru "Invalid JSON URL or resource: {0}" url-or-resource-path)))))))

(def ^:private CustomGeoJSON
  {s/Keyword {:name                     s/Str
              :url                      s/Str
              :region_key               (s/maybe s/Str)
              :region_name              (s/maybe s/Str)
              (s/optional-key :builtin) s/Bool}})

(def ^:private ^:const builtin-geojson
  {:us_states       {:name        "United States"
                     :url         "app/assets/geojson/us-states.json"
                     :region_key  "STATE"
                     :region_name "NAME"
                     :builtin     true}
   :world_countries {:name        "World"
                     :url         "app/assets/geojson/world.json"
                     :region_key  "ISO_A2"
                     :region_name "NAME"
                     :builtin     true}})

(defn- validate-custom-geo-json [geojson-value]
  (s/validate CustomGeoJSON geojson-value)
  (doseq [[_ {geo-url-or-uri :url}] geojson-value]
    (valid-json-url-or-resource? geo-url-or-uri)))

(defsetting custom-geojson
  (deferred-tru "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.")
  :type    :json
  :default {}
  :getter  (fn [] (merge (setting/get-json :custom-geojson) builtin-geojson))
  :setter  (fn [new-value]
             (when new-value
               (validate-custom-geo-json new-value))
             (setting/set-json! :custom-geojson new-value))
  :visibility :public)


(api/defendpoint-async GET "/:key"
  "Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the
  file specified for `key`)."
  [{{:keys [key]} :params} respond raise]
  {key su/NonBlankString}
  (if-let [url (get-in (custom-geojson) [(keyword key) :url])]
    (with-open [reader (io/reader url)
                is     (ReaderInputStream. reader)]
      (respond (-> (rr/response is)
                   (rr/content-type "application/json"))))
    (raise (ex-info (tru "Invalid custom GeoJSON key: {0}" key)
             {:status-code 400}))))

(api/define-routes)
