(ns metabase.api.geojson
  (:require [clojure.java.io :as io]
            [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util
             [i18n :as ui18n :refer [deferred-tru tru]]
             [schema :as su]]
            [ring.util.response :as rr]
            [schema.core :as s])
  (:import org.apache.commons.io.input.ReaderInputStream))

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

(defsetting custom-geojson
  (deferred-tru "JSON containing information about custom GeoJSON files for use in map visualizations instead of the default US State or World GeoJSON.")
  :type    :json
  :default {}
  :getter  (fn [] (merge (setting/get-json :custom-geojson) builtin-geojson))
  :setter  (fn [new-value]
             (when new-value
               (s/validate CustomGeoJSON new-value))
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
