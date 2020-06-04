(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.test :as mt]
            [schema.core :as s]))

(defn- png? [s]
  (= [\P \N \G]
     (drop 1 (take 4 s))))

(deftest basic-test
  (testing "GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/"
    (is (png? ((mt/user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                                         (mt/id :venues :latitude)
                                                         (mt/id :venues :longitude))
               :query (json/generate-string
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}}))))))

(deftest failure-test
  (testing "if the query fails, don't attempt to generate a map without any points -- the endpoint should return a 400"
    (is (schema= {:status   (s/eq "failed")
                  s/Keyword s/Any}
                 (mt/suppress-output
                   ((mt/user->client :rasta) :get 400 (format "tiles/1/1/1/%d/%d/1/1/"
                                                                      (mt/id :venues :latitude)
                                                                      (mt/id :venues :longitude))
                    :query "{}"))))))

(deftest always-run-sync-test
  (testing "even if the original query was saved as `:async?` we shouldn't run the query as async"
    (is (png? ((mt/user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                                         (mt/id :venues :latitude)
                                                         (mt/id :venues :longitude))
               :query (json/generate-string
                       {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}
                        :async?   true}))))))
