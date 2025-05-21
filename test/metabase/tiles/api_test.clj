(ns metabase.tiles.api-test
  "Tests for `/api/tiles` endpoints."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [ring.util.codec :as codec]))

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
  "URL-encoded latitude field ref for the People table"
  []
  (codec/url-encode (json/encode (mt/$ids $people.latitude))))

(defn encoded-lon-field-ref
  "URL-encoded longitude field ref for the People table"
  []
  (codec/url-encode (json/encode (mt/$ids $people.longitude))))

(deftest ad-hoc-query-test
  (testing "GET /api/tiles/:zoom/:x/:y/:lat-field/:lon-field"
    (is (png? (mt/user-http-request
               :crowberto :get 200 (format "tiles/4/2/4/%s/%s"
                                           (encoded-lat-field-ref)
                                           (encoded-lon-field-ref))
               :query (json/encode (venues-query))))))
  (testing "Works on native queries"
    (is (png? (mt/user-http-request
               :crowberto :get 200 (format "tiles/1/1/1/%s/%s"
                                           (encoded-lat-field-ref)
                                           (encoded-lon-field-ref))
               :query (json/encode (native-query)))))))

(deftest saved-card-test
  (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
    (testing "MBQL saved card"
      (mt/with-temp [:model/Card card {:dataset_query (venues-query)}]
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/1/1/1/%s/%s"
                                               (u/id card)
                                               (encoded-lat-field-ref)
                                               (encoded-lon-field-ref)))))))

    (testing "Native saved card"
      (mt/with-temp [:model/Card card {:dataset_query (native-query)}]
        (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/1/1/1/%s/%s"
                                                 (u/id card)
                                                 (encoded-lat-field-ref)
                                                 (encoded-lon-field-ref))))))))

    (testing "Parameterized native saved card"
      (mt/with-temp [:model/Card card {:dataset_query (parameterized-native-query)}]
        (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/1/1/1/%s/%s"
                                                 (u/id card)
                                                 (encoded-lat-field-ref)
                                                 (encoded-lon-field-ref))
                     :parameters (json/encode [{:type :text
                                                :target [:variable [:template-tag :state]]
                                                :value "CA"}])))))))))

(deftest dashcard-test
  (testing "GET /api/tiles/:dashboard-id/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
    (testing "MBQL dashcard"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {:dataset_query (venues-query)}
                     :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                              :dashboard_id dashboard-id}]
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1/%s/%s"
                                               dashboard-id
                                               dashcard-id
                                               card-id
                                               (encoded-lat-field-ref)
                                               (encoded-lon-field-ref)))))))

    (testing "Native dashcard"
      (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                     :model/Card          {card-id :id}      {:dataset_query (native-query)}
                     :model/DashboardCard {dashcard-id :id}  {:card_id card-id
                                                              :dashboard_id dashboard-id}]
        (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
          (is (png? (mt/user-http-request
                     :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1/%s/%s"
                                                 dashboard-id
                                                 dashcard-id
                                                 card-id
                                                 (encoded-lat-field-ref)
                                                 (encoded-lon-field-ref))))))))))

(deftest parameterized-dashcard-test
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
      (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1/%s/%s"
                                               dashboard-id
                                               dashcard-id
                                               card-id
                                               (encoded-lat-field-ref)
                                               (encoded-lon-field-ref))
                   :parameters (json/encode [{:id "_STATE_"
                                              :value ["CA"]}]))))))))

(deftest parameterized-dashcard-test-2
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
      (testing "GET /api/tiles/:card-id/:zoom/:x/:y/:lat-field/:lon-field"
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/%d/dashcard/%d/card/%d/1/1/1/%s/%s"
                                               dashboard-id
                                               dashcard-id
                                               card-id
                                               (encoded-lat-field-ref)
                                               (encoded-lon-field-ref))
                   :parameters (json/encode [{:id "_STATE_"
                                              :value ["CA"]}]))))))))

(deftest tiles-query-test
  (letfn [(clean [q]
            (-> q
                (update-in [:query :filter] #(take 3 %))))]
    (testing "mbql"
      (testing "adds the inside filter and only selects the lat/lon fields"
        (let [query {:database 19
                     :query {:source-table 88
                             :fields [[:field 562 nil]
                                      [:field 574 nil] ; lat
                                      [:field 576 nil]] ; lon

                             :limit 50000}
                     :type :query}]
          (is (= {:database 19
                  :query {:source-table 88
                          :fields [[:field 574 nil]
                                   [:field 576 nil]]
                          :limit 2000
                          :filter [:inside [:field 574 nil] [:field 576 nil]]}
                  :type :query}
                 (clean (#'api.tiles/tiles-query query 2 3 1 [:field 574 nil] [:field 576 nil])))))))

    (testing "native"
      (testing "nests the query, selects fields"
        (let [query {:type :native
                     :native {:query "select name, latitude, longitude from zomato limit 5000;"
                              :template-tags {}}
                     :database 19}]
          (is (= {:database 19
                  :query {:source-query (-> query :native (set/rename-keys {:query :native}))
                          :fields [[:field "latitude" {:base-type :type/Float}]
                                   [:field "longitude" {:base-type :type/Float}]]
                          :filter [:inside
                                   [:field "latitude" {:base-type :type/Float}]
                                   [:field "longitude" {:base-type :type/Float}]]
                          :limit  2000}
                  :type :query}
                 (clean (@#'api.tiles/tiles-query query 2 2 1
                                                  [:field "latitude" {:base-type :type/Float}]
                                                  [:field "longitude" {:base-type :type/Float}])))))))))

(deftest breakout-query-test
  (testing "the appropriate lat/lon fields are selected from the results, if the query contains a :breakout clause (#20182)"
    (mt/dataset test-data
      (with-redefs [api.tiles/create-tile (fn [_ points] points)
                    api.tiles/tile->byte-array identity]
        (let [result (mt/user-http-request
                      :crowberto :get 200 (format "tiles/7/30/49/%s/%s"
                                                  (encoded-lat-field-ref)
                                                  (encoded-lon-field-ref))
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
             :rasta :get 400 (format "tiles/1/1/1/%s/%s"
                                     (encoded-lat-field-ref)
                                     (encoded-lon-field-ref))
             :query (json/encode (mt/mbql-query venues {:filter [:= $users.id 1]})))))))
