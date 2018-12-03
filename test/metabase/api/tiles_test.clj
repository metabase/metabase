(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.users :refer :all]))

;;; GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/
(expect
  String
  ((user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/"
                                          (data/id :venues :latitude)
                                          (data/id :venues :longitude))
   :query (json/generate-string {:database (data/id)
                                 :type     :query
                                 :query    {:source-table (data/id :venues)}})))
