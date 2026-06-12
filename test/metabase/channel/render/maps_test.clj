(ns metabase.channel.render.maps-test
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.maps :as maps])
  (:import
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(defn- blank-tile-png ^bytes []
  (let [img (BufferedImage. 256 256 BufferedImage/TYPE_INT_RGB)
        out (ByteArrayOutputStream.)]
    (ImageIO/write img "png" out)
    (.toByteArray out)))

(deftest render-pin-map-test
  (testing "renders a PNG (sized to the data, within bounds) from points + (mocked) basemap tiles"
    (fake/with-fake-routes {#"https://.*\.tile\.example\.com/.*"
                            (constantly {:status 200 :headers {} :body (blank-tile-png)})}
      (binding [maps/*map-max-width*  600
                maps/*map-max-height* 400]
        (let [png (maps/render-pin-map [[37.7749 -122.4194] [40.7128 -74.0060]]
                                       {:tile-url "https://{s}.tile.example.com/{z}/{x}/{y}.png"})
              img (ImageIO/read (ByteArrayInputStream. ^bytes png))]
          (is (pos? (count png)))
          (is (<= maps/*map-min-width*  (.getWidth img)  600))
          (is (<= maps/*map-min-height* (.getHeight img) 400)))))))

(deftest render-grid-map-test
  (testing "renders binned cells onto a (mocked) basemap, sized to the data within bounds"
    (fake/with-fake-routes {#"https://.*tile\.openstreetmap\.org/.*"
                            (constantly {:status 200 :headers {} :body (blank-tile-png)})}
      (binding [maps/*map-max-width*  600
                maps/*map-max-height* 400]
        (let [cells [{:lat 30 :lon -120 :lat-bin 4 :lon-bin 6 :metric 1}
                     {:lat 38 :lon -90 :lat-bin 4 :lon-bin 6 :metric 9}]
              png   (maps/render-grid-map cells {:tile-url "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"})
              img   (ImageIO/read (ByteArrayInputStream. ^bytes png))]
          (is (pos? (count png)))
          (is (<= maps/*map-min-width*  (.getWidth img)  600))
          (is (<= maps/*map-min-height* (.getHeight img) 400)))))))

(deftest ^:parallel pin-marker-icon-loads-test
  (testing "the teardrop pin marker icon is present on the classpath (markers pin type depends on it)"
    (is (some? (deref @#'maps/pin-marker-icon)))))

(deftest ^:parallel grid-color-endpoints-test
  (testing "the grid color scale runs green (low) to red (high)"
    (let [grid-color @#'maps/grid-color
          low        (grid-color 0.0 0.0 10.0)
          high       (grid-color 10.0 0.0 10.0)]
      (is (> (.getGreen low) (.getRed low)) "low end is greenish")
      (is (> (.getRed high) (.getGreen high)) "high end is reddish"))))

(deftest render-pin-map-resolves-columns-by-semantic-type-test
  (testing "render :pin_map finds lat/long columns by semantic type when the column settings aren't persisted"
    (fake/with-fake-routes {#"https://.*tile\.openstreetmap\.org/.*"
                            (constantly {:status 200 :headers {} :body (blank-tile-png)})}
      (binding [maps/*map-max-width*  600
                maps/*map-max-height* 400]
        (let [card {:display :map :visualization_settings {}}
              data {:cols [{:name "latitude" :semantic_type :type/Latitude}
                           {:name "longitude" :semantic_type :type/Longitude}
                           {:name "state" :semantic_type :type/State}]
                    :rows [[37.7749 -122.4194 "CA"] [40.7128 -74.0060 "NY"]]}
              part (body/render :pin_map :inline "UTC" card nil data)]
          ;; should be a rendered image, NOT a degraded table
          (is (= :img (-> part :content second first))))))))
