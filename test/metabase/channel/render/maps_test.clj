(ns metabase.channel.render.maps-test
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.channel.render.maps :as maps]
   [metabase.pulse.render.test-util :as render.tu])
  (:import
   (java.awt Color)
   (java.io ByteArrayInputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(def ^:private test-sizing-opts
  {:min-width  400
   :min-height 300
   :max-width  600
   :max-height 400})

(defn- assert-png-within-bounds
  "Assert that `png` decodes to an image whose dimensions fall within [[test-sizing-opts]]."
  [^bytes png]
  (let [img (ImageIO/read (ByteArrayInputStream. png))]
    (is (pos? (count png)))
    (is (<= (:min-width test-sizing-opts)  (.getWidth img)  (:max-width test-sizing-opts)))
    (is (<= (:min-height test-sizing-opts) (.getHeight img) (:max-height test-sizing-opts)))))

(deftest render-pin-map-test
  (testing "renders a PNG (sized to the data, within bounds) from points + (mocked) basemap tiles"
    (fake/with-fake-routes (render.tu/fake-tile-routes #"https://.*\.tile\.example\.com/.*")
      (assert-png-within-bounds
       (maps/render-pin-map [[37.7749 -122.4194] [40.7128 -74.0060]]
                            (assoc test-sizing-opts
                                   :tile-url "https://{s}.tile.example.com/{z}/{x}/{y}.png"))))))

(deftest render-grid-map-test
  (testing "renders binned cells onto a (mocked) basemap, sized to the data within bounds"
    (fake/with-fake-routes (render.tu/fake-tile-routes #"https://.*tile\.openstreetmap\.org/.*")
      (assert-png-within-bounds
       (maps/render-grid-map [{:lat     30
                               :lon     -120
                               :lat-bin 4
                               :lon-bin 6
                               :metric  1}
                              {:lat     38
                               :lon     -90
                               :lat-bin 4
                               :lon-bin 6
                               :metric  9}]
                             (assoc test-sizing-opts
                                    :tile-url "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"))))))

(deftest ^:parallel pin-marker-icon-loads-test
  (testing "the teardrop pin marker icon is present on the classpath (markers pin type depends on it)"
    (is (some? (deref @#'maps/pin-marker-icon)))))

(deftest ^:parallel grid-color-endpoints-test
  (testing "the grid color scale runs green (low) to red (high)"
    (let [grid-color  @#'maps/grid-color
          ^Color low  (grid-color 0.0 0.0 10.0)
          ^Color high (grid-color 10.0 0.0 10.0)]
      (is (> (.getGreen low) (.getRed low)) "low end is greenish")
      (is (> (.getRed high) (.getGreen high)) "high end is reddish"))))
