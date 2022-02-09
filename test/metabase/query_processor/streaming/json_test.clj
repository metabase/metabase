(ns metabase.query-processor.streaming.json-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.streaming.json :as streaming.json]))

(deftest map->serialized-json-kvs-test
  (is (= "\"a\":100,\"b\":200"
         (#'streaming.json/map->serialized-json-kvs {:a 100, :b 200}))))
