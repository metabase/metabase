(ns build-drivers.install-driver-locally-test
  (:require [build-drivers.install-driver-locally :as install-driver-locally]
            [clojure.string :as str]
            [clojure.test :refer :all]))

(deftest local-install-checksum-filename-test
  (is (str/ends-with?
       (#'install-driver-locally/local-install-checksum-filename :oracle :ee)
       ".m2/repository/metabase/oracle-driver/ee-checksum.md5"))
  (is (str/ends-with?
       (#'install-driver-locally/local-install-checksum-filename :oracle :oss)
       ".m2/repository/metabase/oracle-driver/checksum.md5"))
  (doseq [edition [:oss :ee]]
    (is (str/ends-with?
         (#'install-driver-locally/local-install-checksum-filename :sqlite edition)
         ".m2/repository/metabase/sqlite-driver/checksum.md5"))))
