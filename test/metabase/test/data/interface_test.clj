(ns metabase.test.data.interface-test
  (:require
   [clojure.test :refer :all]
   [metabase.test.data.interface :as tx]))

(def ^:private dbdef
  (tx/dataset-definition "ephemeral-marker-test"
                         [["widget"
                           [{:field-name "name", :base-type :type/Text}]
                           [["a"]]]]))

(deftest ^:parallel ephemeral-marker-test
  (testing "a plain dataset definition outlives the run, so it must not be marked disposable by default"
    (is (not (tx/ephemeral? (tx/get-dataset-definition dbdef)))))
  (testing "marking round-trips through the definition drivers actually receive"
    (is (tx/ephemeral? (tx/ephemeral dbdef))))
  (testing "the marker survives the schema, which is closed - an unlisted option key would be rejected"
    (is (some? (tx/hash-dataset (tx/ephemeral dbdef))))))
