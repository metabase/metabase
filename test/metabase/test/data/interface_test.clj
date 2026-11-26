(ns metabase.test.data.interface-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(defn- bytes-dataset [^String s]
  (tx/dataset-definition "bytes"
                         [["t" [{:field-name "x", :base-type :type/Text}] [["a" (.getBytes s)]]]]
                         {:static true}))

(deftest ^:parallel hash-dataset-byte-arrays-test
  (testing "byte arrays are hashed by their contents"
    (is (= (tx/hash-dataset (bytes-dataset "20190421"))
           (tx/hash-dataset (bytes-dataset "20190421"))))
    (is (not= (tx/hash-dataset (bytes-dataset "20190421"))
              (tx/hash-dataset (bytes-dataset "20200421"))))))
