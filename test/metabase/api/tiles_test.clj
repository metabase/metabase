(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [schema.core :as s]))

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
    (testing "GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/"
      (is (png? (mt/user-http-request
                 :rasta :get 200 (format "tiles/1/1/1/%d/%d/1/2/"
                                         (mt/id :venues :latitude)
                                         (mt/id :venues :longitude))
                 :query (json/generate-string venues-query)))))
    (testing "Works on native queries"
      (let [native-query {:query (:query (qp/query->native venues-query))
                          :template-tags {}}]
        (is (png? (mt/user-http-request
                   :rasta :get 200 (format "tiles/1/1/1/%s/%s/1/2/"
                                           "LATITUDE" "LONGITUDE")
                   :query (json/generate-string
                           {:database (mt/id)
                            :type :native
                            :native native-query}))))))))

(deftest failure-test
  (testing "if the query fails, don't attempt to generate a map without any points -- the endpoint should return a 400"
    (is (schema= {:status   (s/eq "failed")
                  s/Keyword s/Any}
                 (mt/user-http-request
                  :rasta :get 400 (format "tiles/1/1/1/%d/%d/1/1/"
                                          (mt/id :venues :latitude)
                                          (mt/id :venues :longitude))
                  :query "{}")))))

(deftest always-run-sync-test
  (testing "even if the original query was saved as `:async?` we shouldn't run the query as async"
    (is (png? (mt/user-http-request
               :rasta :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                       (mt/id :venues :latitude)
                                       (mt/id :venues :longitude))
               :query (json/generate-string
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}
                        :async?   true}))))))
