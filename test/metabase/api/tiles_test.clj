(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [schema.core :as s]))

;;; GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/
(expect
  #".*PNG.*"
  ((test-users/user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                                     (data/id :venues :latitude)
                                                     (data/id :venues :longitude))
   :query (json/generate-string
           {:database (data/id)
            :type     :query
            :query    {:source-table (data/id :venues)}})))

;; if the query fails, don't attempt to generate a map without any points -- the endpoint should return a 400
(tu/expect-schema
  {:status   (s/eq "failed")
   s/Keyword s/Any}
  ((test-users/user->client :rasta) :get 400 (format "tiles/1/1/1/%d/%d/1/1/"
                                                     (data/id :venues :latitude)
                                                     (data/id :venues :longitude))
   :query "{}"))

;; even if the original query was saved as `:async?` we shouldn't run the query as async (and get a core.async channel
;; and fail)
(expect
  #".*PNG.*"
  ((test-users/user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                                     (data/id :venues :latitude)
                                                     (data/id :venues :longitude))
   :query (json/generate-string
           {:database (data/id)
            :type     :query
            :query    {:source-table (data/id :venues)}
            :async?   true})))
