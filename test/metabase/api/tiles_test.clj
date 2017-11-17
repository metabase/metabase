(ns metabase.api.tiles-test
  "Tests for `/api/tiles` endpoints."
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]))

;;; GET /api/tiles/:zoom/:x/:y/:lat-field-id/:lon-field-id/:lat-col-idx/:lon-col-idx/
(expect
  String
  ((user->client :rasta) :get 200 (format "tiles/1/1/1/%d/%d/1/1/" (id :venues :latitude) (id :venues :longitude))
   :query (json/generate-string {:database (id)
                                 :type     :query
                                 :query    (ql/query
                                             (ql/source-table (id :venues)))})))
