(ns metabase.api.geojson-test
  (:require [expectations :refer [expect]]
            [metabase.api.geojson :as geojson-api]
            [metabase.test.data.users :refer [user->client]]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [schema.core :as s]
            [metabase.test.util.log :as tu.log]))

(def ^:private ^String test-geojson-url
  "URL of a GeoJSON file used for test purposes."
  "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/test.geojson")

(def ^:private test-custom-geojson
  {:middle-earth {:name        "Middle Earth"
                  :url         test-geojson-url
                  :builtin     true
                  :region_key  nil
                  :region_name nil}})


;;; test valid-json-url?
(expect
  (#'geojson-api/valid-json-url? test-geojson-url))


;;; test valid-json-resource?
(expect
  (#'geojson-api/valid-json-resource? "app/assets/geojson/us-states.json"))


;;; test the CustomGeoJSON schema
(expect
  (boolean (s/validate @#'geojson-api/CustomGeoJSON test-custom-geojson)))

;; test that you're not allowed to set invalid URLs
(expect
  Exception
  (geojson-api/custom-geojson {:name        "Middle Earth"
                               :url         "ABC"
                               :region_key  nil
                               :region_name nil}))

(expect
  Exception
  (geojson-api/custom-geojson {:name        "Middle Earth"
                               :url         "http://google.com"
                               :region_key  nil
                               :region_name nil}))


;;; test that we can set the value of geojson-api/custom-geojson via the normal routes
(expect
  (merge @#'geojson-api/builtin-geojson test-custom-geojson)
  ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
  (u/auto-retry 3
    ;; bind a temporary value so it will get set back to its old value here after the API calls are done
    ;; stomping all over it
    (tu/with-temporary-setting-values [custom-geojson nil]
      ((user->client :crowberto) :put 200 "setting/custom-geojson" {:value test-custom-geojson})
      ((user->client :crowberto) :get 200 "setting/custom-geojson"))))

;; Test that a bad url will return a descriptive error message
(expect
  #"Unable to retrieve resource"
  (tu.log/suppress-output
    ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
    (u/auto-retry 3
      ;; bind a temporary value so it will get set back to its old value here after the API calls are done
      ;; stomping all over it
      (tu/with-temporary-setting-values [custom-geojson nil]
        (let [bad-url-custom-geojson (update-in test-custom-geojson [:middle-earth :url] str "something-random")]
          (:message ((user->client :crowberto) :put 500 "setting/custom-geojson" {:value bad-url-custom-geojson})))))))

;; Test that a bad host will return a connection refused error
(expect
  #"Unable to connect"
  (tu.log/suppress-output
    ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
    (u/auto-retry 3
      ;; bind a temporary value so it will get set back to its old value here after the API calls are done
      ;; stomping all over it
      (tu/with-temporary-setting-values [custom-geojson nil]
        (let [bad-url-custom-geojson (assoc-in test-custom-geojson [:middle-earth :url] "https://somethingrandom.metabase.com")]
          (:message ((user->client :crowberto) :put 500 "setting/custom-geojson" {:value bad-url-custom-geojson})))))))

;; Test out the error message for a relative path file we can't find
(expect
  #"Unable to find JSON via relative path"
  (tu.log/suppress-output
    ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
    (u/auto-retry 3
      ;; bind a temporary value so it will get set back to its old value here after the API calls are done
      ;; stomping all over it
      (tu/with-temporary-setting-values [custom-geojson nil]
        (let [bad-url-custom-geojson (assoc-in test-custom-geojson [:middle-earth :url] "some/relative/path")]
          (:message ((user->client :crowberto) :put 500 "setting/custom-geojson" {:value bad-url-custom-geojson})))))))


;;; test the endpoint that acts as a proxy for JSON files
(expect
  {:type        "Point"
   :coordinates [37.77986 -122.429]}
  (tu/with-temporary-setting-values [custom-geojson test-custom-geojson]
    ((user->client :rasta) :get 200 "geojson/middle-earth")))

;; try fetching an invalid key; should fail
(expect
  "Invalid custom GeoJSON key: invalid-key"
  (tu/with-temporary-setting-values [custom-geojson test-custom-geojson]
    ((user->client :rasta) :get 400 "geojson/invalid-key")))
