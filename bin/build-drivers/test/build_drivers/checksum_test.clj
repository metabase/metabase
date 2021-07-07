(ns build-drivers.checksum-test
  (:require [build-drivers.checksum :as checksum]
            [clojure.test :refer :all]))

(deftest driver-checksum-test
  (testing "OSS/EE checksums should be the same for drivers that don't have different oss/ee profiles"
    (is (= (checksum/driver-checksum :sqlite :oss)
           (checksum/driver-checksum :sqlite :ee))))
  (testing "OSS/EE checksums should be different for drivers that have different oss/ee profiles"
    (is (not= (checksum/driver-checksum :oracle :oss)
              (checksum/driver-checksum :oracle :ee)))))
