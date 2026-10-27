(ns metabase.geojson.rest.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.geojson.core :as geojson]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [ring.util.response :as response])
  (:import
   (java.io BufferedReader)
   (org.apache.commons.io.input ReaderInputStream)))

(set! *warn-on-reflection* true)

(defn- read-url-and-respond
  "Reads the provided URL and responds with the contents as a stream."
  [url respond]
  (with-open [^BufferedReader reader (geojson/url->reader url)
              is                     (ReaderInputStream. reader)]
    (respond (-> (response/response is)
                 (response/content-type "application/json")))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:key"
  "Fetch a custom GeoJSON file as defined in the [[metabase.geojson.settings/custom-geojson]] setting. (This just acts
  as a simple proxy for the file specified for `key`)."
  [{k :key, :as _route-params} :- [:map {:closed true}
                                   [:key ms/NonBlankString]]
   _query-params
   _body
   _request
   respond
   raise]
  (when-not (geojson.settings/custom-geojson-enabled)
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (if-let [url (get-in (geojson.settings/user-defined-custom-geojson) [(keyword k) :url])]
    (try
      (read-url-and-respond url respond)
      (catch Throwable e
        (raise e)))
    (raise (ex-info (tru "Invalid custom GeoJSON key: {0}" k) {:status-code 400}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Load a custom GeoJSON file based on a URL or file path provided as a query parameter.
  This behaves similarly to /api/geojson/:key but doesn't require the custom map to be saved to the DB first."
  [_route-params
   {:keys [url], :as _query-params} :- [:map {:closed true}
                                        [:url ms/NonBlankString]]
   _body
   _request
   respond
   raise]
  (perms/check-has-application-permission :setting)
  (when-not (geojson.settings/custom-geojson-enabled)
    (raise (ex-info (tru "Custom GeoJSON is not enabled") {:status-code 400})))
  (let [decoded-url (codec/url-decode url)]
    (try
      (when-not (geojson.settings/valid-geojson-url? decoded-url)
        (throw (ex-info (geojson.settings/invalid-location-msg) {:status-code 400})))
      (read-url-and-respond decoded-url respond)
      (catch Throwable e
        (raise e)))))
