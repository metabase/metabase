(ns metabase.api.geojson
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            [compojure.core :refer [defroutes GET]]
            [schema.core :as s]
            [metabase.api.common :refer :all]
            [metabase.models.setting :refer [defsetting], :as setting]
            [metabase.util :as u]
            [metabase.util.schema :as su]))

(defn- valid-json?
  "Does this URL-OR-RESOURCE point to valid JSON?
   URL-OR-RESOURCE should be something that can be passed to `slurp`, like an HTTP URL or a `java.net.URL` (which is what `io/resource` returns below)."
  [url-or-resource]
  (u/with-timeout 5000
    (json/parse-string (slurp url-or-resource)))
  true)

(defn- valid-json-resource?
  "Does this RELATIVE-PATH point to a valid local JSON resource? (RELATIVE-PATH is something like \"app/charts/us-states.json\".)"
  [relative-path]
  (when-let [^java.net.URI uri (u/ignore-exceptions (java.net.URI. relative-path))]
    (when-not (.isAbsolute uri)
      (valid-json? (io/resource (str "frontend_client" uri))))))

(defn- valid-json-url?
  "Is URL a valid HTTP URL and does it point to valid JSON?"
  [url]
  (when (u/is-url? url)
    (valid-json? url)))

(def ^:private valid-json-url-or-resource?
  "Check that remote URL points to a valid JSON file, or throw an exception.
   Since the remote file isn't likely to change, this check isn't repeated for URLs that have already succeded;
   if the check fails, an exception is thrown (thereby preventing memoization)."
  (memoize (fn [url-or-resource-path]
             (or (valid-json-url? url-or-resource-path)
                 (valid-json-resource? url-or-resource-path)
                 (throw (Exception. (str "Invalid JSON URL or resource: " url-or-resource-path)))))))

(def ^:private CustomGeoJSON
  {s/Keyword {:name                     s/Str
              :url                      (s/constrained s/Str valid-json-url-or-resource? "URL must point to a valid JSON file.")
              :region_key               (s/maybe s/Str)
              :region_name              (s/maybe s/Str)
              (s/optional-key :builtin) s/Bool}})

(def ^:private ^:const builtin-geojson
  {:us_states       {:name        "United States"
                     :url         "/app/charts/us-states.json"
                     :region_key  "name"
                     :region_name "name"
                     :builtin     true}
   :world_countries {:name        "World"
                     :url         "/app/charts/world.json"
                     :region_key  "ISO_A2"
                     :region_name "NAME"
                     :builtin     true}})

(defsetting custom-geojson
  "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON."
  :type    :json
  :default {}
  :getter  (fn [] (merge (setting/get-json :custom-geojson) builtin-geojson))
  :setter  (fn [new-value]
             (when new-value
               (s/validate CustomGeoJSON new-value))
             (setting/set-json! :custom-geojson new-value)))


(defendpoint GET "/:key"
  "Fetch a custom GeoJSON file as defined in the `custom-geojson` setting. (This just acts as a simple proxy for the file specified for KEY)."
  [key]
  {key su/NonBlankString}
  (let [url (or (get-in (custom-geojson) [(keyword key) :url])
                (throw (ex-info (str "Invalid custom GeoJSON key: " key)
                         {:status-code 400})))]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    (u/with-timeout 5000
                (slurp url))}))


(define-routes)
