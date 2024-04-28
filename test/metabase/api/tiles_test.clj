(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.tiles :as api.tiles]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(defn- png? [s]
  (= [\P \N \G]
     (drop 1 (take 4 s))))

(deftest basic-test
  (let [venues-query {:database (mt/id)
                      :type     :query
                      :query    {:source-table (mt/id :venues)
                                 :fields [[:field (mt/id :venues :name) nil]
                                          [:field (mt/id :venues :latitude) nil]
                                          [:field (mt/id :venues :longitude) nil]]}}]
    (testing "GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id"
      (is (png? (mt/user-http-request
                 :crowberto :get 200 (format "tiles/1/1/1/%d/%d"
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude))
                 :query (json/generate-string venues-query)))))
    (testing "Works on native queries"
      (let [native-query {:query (:query (qp.compile/compile venues-query))
                          :template-tags {}}]
        (is (png? (mt/user-http-request
                   :crowberto :get 200 (format "tiles/1/1/1/%s/%s"
                                               "LATITUDE" "LONGITUDE")
                   :query (json/generate-string
                           {:database (mt/id)
                            :type :native
                            :native native-query}))))))))

(deftest query->tiles-query-test
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
                 (clean (#'api.tiles/query->tiles-query query
                                                        {:zoom 2 :x 3 :y 1
                                                         :lat-field [:field 574 nil]
                                                         :lon-field [:field 576 nil]})))))))
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
                 (clean (@#'api.tiles/query->tiles-query query
                                                         {:zoom 2 :x 2 :y 1
                                                          :lat-field [:field "latitude" {:base-type :type/Float}]
                                                          :lon-field [:field "longitude" {:base-type :type/Float}]})))))))))

(deftest breakout-query-test
  (testing "the appropriate lat/lon fields are selected from the results, if the query contains a :breakout clause (#20182)"
    (mt/dataset test-data
      (with-redefs [api.tiles/create-tile (fn [_ points] points)
                    api.tiles/tile->byte-array identity]
        (let [result (mt/user-http-request
                      :crowberto :get 200 (format "tiles/7/30/49/%d/%d"
                                              (mt/id :people :latitude)
                                              (mt/id :people :longitude))
                      :query (json/generate-string
                              {:database (mt/id)
                               :type :query
                               :query {:source-table (mt/id :people)
                                       :breakout [[:field (mt/id :people :latitude)]
                                                  [:field (mt/id :people :longitude)]]
                                       :aggregation [[:count]]}}))]
          (is (= [[36.6163612 -94.5197949]
                  [36.8177783 -93.8447328]
                  [36.8311004 -95.0253779]]
                 (take 3 result))))))))

(deftest ^:parallel failure-test
  (testing "if the query fails, don't attempt to generate a map without any points -- the endpoint should return a 400"
    (is (=? {:status "failed"}
            (mt/user-http-request
             :rasta :get 400 (format "tiles/1/1/1/%d/%d"
                                     (mt/id :venues :latitude)
                                     (mt/id :venues :longitude))
             :query (json/encode (mt/mbql-query venues {:filter [:= $users.id 1]})))))))

(deftest ^:parallel field-ref-test
  (testing "Field refs can be constructed from strings representing integer field IDs or field names"
    (is (= [:field 1 nil]
           (@#'api.tiles/field-ref "1")))
    (is (= [:field "Latitude" {:base-type :type/Float}]
           (@#'api.tiles/field-ref "Latitude")))))
