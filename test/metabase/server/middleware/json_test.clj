(ns metabase.server.middleware.json-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.server.middleware.json :as mw.json]))

(comment mw.json/keep-me) ; so custom Cheshire encoders are loaded

(deftest encode-byte-arrays-test
  (testing "Check that we encode byte arrays as the hex values of their first four bytes"
    (is (= "{\"my-bytes\":\"0xC42360D7\"}"
           (json/generate-string
            {:my-bytes (byte-array [196 35  96 215  8 106 108 248 183 215 244 143  17 160 53 186
                                    213 30 116  25 87  31 123 172 207 108  47 107 191 215 76  92])})))))
