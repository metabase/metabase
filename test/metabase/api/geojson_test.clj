(ns metabase.api.geojson-test
  (:require [clojure.test :refer :all]
            [metabase
             [http-client :as client]
             [test :as mt]
             [util :as u]]
            [metabase.api.geojson :as geojson-api]
            [metabase.middleware.security :as mw.security]
            [schema.core :as s]))

(def ^:private ^String test-geojson-url
  "URL of a GeoJSON file used for test purposes."
  "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/test.geojson")

(def ^:private test-custom-geojson
  {:middle-earth {:name        "Middle Earth"
                  :url         test-geojson-url
                  :builtin     true
                  :region_key  nil
                  :region_name nil}})


(deftest valid-url-test
  (is (= true
         (#'geojson-api/valid-json-url-string? test-geojson-url))))


(deftest valid-resource-test
  (is (= true
         (#'geojson-api/valid-json-resource-path-string? "app/assets/geojson/us-states.json"))))

(deftest geojson-schema-test
  (is (= true
         (boolean (s/validate @#'geojson-api/CustomGeoJSON test-custom-geojson)))))

(deftest invalid-url-test
  (testing "test that you're not allowed to set invalid URLs"
    (is (thrown?
         Exception
         (geojson-api/custom-geojson {:name        "Middle Earth"
                                      :url         "ABC"
                                      :region_key  nil
                                      :region_name nil})))

    (is (thrown?
         Exception
         (geojson-api/custom-geojson {:name        "Middle Earth"
                                      :url         "http://google.com"
                                      :region_key  nil
                                      :region_name nil})))))

(deftest update-endpoint-test
  (testing "PUT /api/setting/custom-geojson"
    (testing "test that we can set the value of geojson-api/custom-geojson via the normal routes"
      (is (= (merge @#'geojson-api/builtin-geojson test-custom-geojson)
             ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
             (u/auto-retry 3
               ;; bind a temporary value so it will get set back to its old value here after the API calls are done
               ;; stomping all over it
               (mt/with-temporary-setting-values [custom-geojson nil]
                 ((mt/user->client :crowberto) :put 204 "setting/custom-geojson" {:value test-custom-geojson})
                 ((mt/user->client :crowberto) :get 200 "setting/custom-geojson"))))))

    (testing "error conditions"
      (letfn [(put-bad-url [url]
                (mt/suppress-output
                 ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
                 (u/auto-retry 3
                               ;; bind a temporary value so it will get set back to its old value here after the API calls are done
                               ;; stomping all over it
                               (mt/with-temporary-setting-values [custom-geojson nil]
                                 (let [url (assoc-in test-custom-geojson [:middle-earth :url] url)]
                                   (:message ((mt/user->client :crowberto) :put 500 "setting/custom-geojson" {:value url})))))))]
        (testing "Test that a bad url will return a descriptive error message"
          (is (re= #"^Unable to retrieve resource.*"
                   (put-bad-url "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/something-random"))))

        (testing "Test that a bad host will return a connection refused error"
          (is (re= #"^Unable to connect.*"
                   (put-bad-url "https://somethingrandom.metabase.com"))))

        (testing "Test out the error message for a relative path file we can't find"
          (is (re= #"^Unable to find JSON via relative path.*"
                   (put-bad-url "some/relative/path"))))))))

(deftest proxy-endpoint-test
  (testing "GET /api/geojson/:key"
    (mt/with-temporary-setting-values [custom-geojson test-custom-geojson]
      (testing "test the endpoint that acts as a proxy for JSON files"
        (is (= {:type        "Point"
                :coordinates [37.77986 -122.429]}
               ((mt/user->client :rasta) :get 200 "geojson/middle-earth"))))
      (testing "response should not include the usual cache-busting headers"
        (is (= (#'mw.security/cache-far-future-headers)
               (select-keys (:headers (client/client-full-response :get 200 "geojson/middle-earth"))
                            (keys (#'mw.security/cache-prevention-headers))))))
      (testing "should be able to fetch the GeoJSON even if you aren't logged in"
        (is (= {:type        "Point"
                :coordinates [37.77986 -122.429]}
               (client/client :get 200 "geojson/middle-earth"))))
      (testing "error conditions"
        (testing "try fetching an invalid key; should fail"
          (is (= "Invalid custom GeoJSON key: invalid-key"
                 ((mt/user->client :rasta) :get 400 "geojson/invalid-key"))))))))
