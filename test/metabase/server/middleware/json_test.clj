(ns metabase.server.middleware.json-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.http-client]
   [metabase.server.handler :as handler]
   [metabase.server.middleware.json :as mw.json]
   [metabase.util.json :as json]))

(comment mw.json/keep-me) ; so custom Cheshire encoders are loaded

(set! *warn-on-reflection* true)

(deftest encode-byte-arrays-test
  (testing "Check that we encode byte arrays as the hex values of their first four bytes"
    (is (= "{\"my-bytes\":\"0xC42360D7\"}"
           (json/encode
            {:my-bytes (byte-array [196 35  96 215  8 106 108 248 183 215 244 143  17 160 53 186
                                    213 30 116  25 87  31 123 172 207 108  47 107 191 215 76  92])})))))

(defn- raw-json-req
  "Kind of `mt/http-request`, but is less picky about body :)"
  [method url ^String body]
  (handler/app {:method method
                :uri     (str metabase.http-client/*url-prefix* url)
                :headers {"content-type" "application/json"}
                :body    (io/input-stream (.getBytes body))}
               #(-> (:body %)
                    io/reader
                    json/decode+kw)
               (fn raise [e] (throw e))))

(deftest json-error-test
  (testing "Parsing invalid JSON returns messages with some details"
    (is (= {:error
            "Unrecognized token 'ture': was expecting (JSON String, Number, Array, Object or token 'null', 'true' or 'false') at 1:17"}
           (raw-json-req :post "/alert/" "{\"archive\": ture}")))))
