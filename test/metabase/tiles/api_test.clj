(ns metabase.tiles.api-test
  "Tests for `/api/tiles` endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.test :as mt]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.json :as json]))

;; TODO: Assert on the contents of the response, not just the format
(defn png? [s]
  (= [\P \N \G] (drop 1 (take 4 s))))

(defn- venues-query
  []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :people)
              :fields [[:field (mt/id :people :id) nil]
                       [:field (mt/id :people :state) nil]
                       [:field (mt/id :people :latitude) nil]
                       [:field (mt/id :people :longitude) nil]]}})

(defn- native-query
  []
  {:database (mt/id)
   :type     :native
   :native   {:query "SELECT LATITUDE, LONGITUDE FROM PEOPLE;"
              :template-tags {}}})

(defn- parameterized-native-query
  []
  {:database (mt/id)
   :type     :native
   :native   {:query "SELECT LATITUDE, LONGITUDE FROM PEOPLE WHERE STATE = {{state}};"
              :template-tags {"state" {:id           "_STATE_"
                                       :name         "state"
                                       :display-name "State"
                                       :type         "text"
                                       :required     false}}}})

(defn encoded-lat-field-ref
  "JSON-encoded latitude field ref for the People table"
  ([]
   (encoded-lat-field-ref :mbql))
  ([mbql-or-native]
   (json/encode
    (case mbql-or-native
      :mbql   (mt/$ids $people.latitude)
      :native [:field "LATITUDE" {:base-type :type/Float}]))))

(defn encoded-lon-field-ref
  "JSON-encoded longitude field ref for the People table"
  ([]
   (encoded-lon-field-ref :mbql))
  ([mbql-or-native]
   (json/encode
    (case mbql-or-native
      :mbql   (mt/$ids $people.longitude)
      :native [:field "LONGITUDE" {:base-type :type/Float}]))))

(deftest ^:parallel ad-hoc-query-test
  (testing "GET /api/tiles/:zoom/:x/:y with latField and lonField query params"
    (is (png? (mt/user-http-request
               :crowberto :get 200 "tiles/4/2/4"
               :query (json/encode (venues-query))
               :latField (encoded-lat-field-ref :mbql)
               :lonField (encoded-lon-field-ref :mbql))))))

(deftest ^:parallel ad-hoc-query-test-2
  (testing "Works on native queries"
    (is (png? (mt/user-http-request
               :crowberto :get 200 "tiles/1/1/1"
               :query (json/encode (native-query))
               :latField (encoded-lat-field-ref :native)
               :lonField (encoded-lon-field-ref :native))))))

(deftest ^:parallel saved-card-test
  (testing "GET /api/tiles/:card-id/:zoom/:x/:y with latField and lonField query params"
    (testing "MBQL saved card"
      (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/1/1/1" (u/id card))
                   :latField (encoded-lat-field-ref :mbql)
                   :lonField (encoded-lon-field-ref :mbql))))))))

(deftest ^:parallel saved-card-test-2
  (testing "GET /api/tiles/:card-id/:zoom/:x/:y with latField and lonField query params"
    (testing "Native saved card"
      (mt/with-temp [:model/Card card {:dataset_query (native-query)}]
        (testing "GET /api/tiles/:card-id/:zoom/:x/:y with latField and lonField query params"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/1/1/1" (u/id card))
                     :latField (encoded-lat-field-ref :native)
                     :lonField (encoded-lon-field-ref :native)))))))))

(deftest ^:parallel saved-card-test-3
  (testing "GET /api/tiles/:card-id/:zoom/:x/:y with latField and lonField query params"
    (testing "Parameterized native saved card"
      (mt/with-temp [:model/Card card {:dataset_query (parameterized-native-query)}]
        (testing "GET /api/tiles/:card-id/:zoom/:x/:y with latField and lonField query params"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/1/1/1" (u/id card))
                     :latField (encoded-lat-field-ref :native)
                     :lonField (encoded-lon-field-ref :native)
                     :parameters (json/encode [{:id "_STATE_"
                                                :type :text
                                                :target [:variable [:template-tag :state]]
                                                :value "CA"}])))))))))

(deftest ^:parallel dashcard-test
  (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y with latField and lonField query params"
    (testing "MBQL dashcard"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {:dataset_query (venues-query)}
                     :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                              :dashboard_id dashboard-id}]
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1"
                                               dashboard-id
                                               dashcard-id
                                               card-id)
                   :latField (encoded-lat-field-ref :mbql)
                   :lonField (encoded-lon-field-ref :mbql))))))))

(deftest ^:parallel dashcard-test-2
  (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y with latField and lonField query params"
    (testing "Native dashcard"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {:dataset_query (native-query)}
                     :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                              :dashboard_id dashboard-id}]
        (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y with latField and lonField query params"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1"
                                                 dashboard-id
                                                 dashcard-id
                                                 card-id)
                     :latField (encoded-lat-field-ref :native)
                     :lonField (encoded-lon-field-ref :native)))))))))

(deftest ^:parallel parameterized-dashcard-test
  (testing "Parameterized mbql dashcard"
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {:parameters [{:name "State"
                                                                          :id "_STATE_"
                                                                          :type "text"}]}

                   :model/Card          {card-id :id}      {:dataset_query (venues-query)}
                   :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                            :dashboard_id dashboard-id
                                                            :parameter_mappings [{:parameter_id "_STATE_"
                                                                                  :card_id card-id
                                                                                  :target [:dimension (mt/$ids people $state)]}]}]
      (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y with latField and lonField query params"
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1"
                                               dashboard-id
                                               dashcard-id
                                               card-id)
                   :latField (encoded-lat-field-ref :mbql)
                   :lonField (encoded-lon-field-ref :mbql)
                   :parameters (json/encode [{:id "_STATE_"
                                              :type "text"
                                              :value ["CA"]}]))))))))

(deftest ^:parallel parameterized-dashcard-test-2
  (testing "Parameterized native dashcard"
    (mt/with-temp [:model/Dashboard     {dashboard-id :id} {:parameters [{:name "State"
                                                                          :id "_STATE_"
                                                                          :type "text"}]}

                   :model/Card          {card-id :id}      {:dataset_query (parameterized-native-query)}
                   :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                            :dashboard_id dashboard-id
                                                            :parameter_mappings [{:parameter_id "_STATE_"
                                                                                  :card_id card-id
                                                                                  :target [:variable ["template-tag" "state"]]}]}]
      (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y with latField and lonField query params"
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1"
                                               dashboard-id
                                               dashcard-id
                                               card-id)
                   :latField (encoded-lat-field-ref :native)
                   :lonField (encoded-lon-field-ref :native)
                   :parameters (json/encode [{:id "_STATE_"
                                              :type "text"
                                              :value ["CA"]}]))))))))

(deftest ^:parallel tiles-query-test
  (testing "mbql"
    (testing "adds the inside filter and only selects the lat/lon fields"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                      (lib/limit 50000)
                      (lib/with-fields [(meta/field-metadata :people :id)
                                        (meta/field-metadata :people :latitude)
                                        (meta/field-metadata :people :longitude)]))]
        (is (=? {:stages [{}
                          ;; should append a new stage
                          {:fields  [[:field {} "LATITUDE"]
                                     [:field {} "LONGITUDE"]]
                           :limit   2000
                           :filters [[:inside {}
                                      [:field {} "LATITUDE"]
                                      [:field {} "LONGITUDE"]
                                      double?
                                      double?
                                      double?
                                      double?]]}]}
                (#'api.tiles/tiles-query query 2 3 1
                                         [:field (meta/id :people :latitude) nil]
                                         [:field (meta/id :people :longitude) nil])))))))

(deftest ^:parallel tiles-query-test-2
  (testing "native"
    (testing "nests the query, selects fields"
      (let [query (lib/native-query meta/metadata-provider "select name, latitude, longitude from zomato limit 5000;")]
        (is (=? {:stages [{:native "select name, latitude, longitude from zomato limit 5000;"}
                          {:fields  [[:field {:base-type :type/Float} "latitude"]
                                     [:field {:base-type :type/Float} "longitude"]]
                           :filters [[:inside
                                      {}
                                      [:field {:base-type :type/Float} "latitude"]
                                      [:field {:base-type :type/Float} "longitude"]
                                      double?
                                      double?
                                      double?
                                      double?]]
                           :limit   2000}]}
                (@#'api.tiles/tiles-query query 2 2 1
                                          [:field "latitude" {:base-type :type/Float}]
                                          [:field "longitude" {:base-type :type/Float}])))))))

(deftest breakout-query-test
  (testing "the appropriate lat/lon fields are selected from the results, if the query contains a :breakout clause (#20182)"
    (mt/dataset test-data
      (with-redefs [api.tiles/create-tile (fn [_ points] points)
                    api.tiles/tile->byte-array identity]
        (let [result (mt/user-http-request
                      :crowberto :get 200 "tiles/7/30/49"
                      :latField (encoded-lat-field-ref :mbql)
                      :lonField (encoded-lon-field-ref :mbql)
                      :query (json/encode
                              (mt/mbql-query people
                                {:breakout    [[:field (mt/id :people :latitude)]
                                               [:field (mt/id :people :longitude)]]
                                 :aggregation [[:count]]})))]
          (is (= [[36.6163612 -94.5197949]
                  [36.8177783 -93.8447328]
                  [36.8311004 -95.0253779]]
                 (take 3 result))))))))

(deftest ^:parallel failure-test
  (testing "if the query fails, don't attempt to generate a map without any points -- the endpoint should return a 400"
    (is (=? {:status "failed"}
            (mt/user-http-request
             :rasta :get 400 "tiles/1/1/1"
             :latField (encoded-lat-field-ref :mbql)
             :lonField (encoded-lon-field-ref :mbql)
             :query (json/encode (mt/mbql-query people {:filter [:= $people.id "X"]})))))))
