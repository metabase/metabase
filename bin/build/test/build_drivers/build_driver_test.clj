(ns build-drivers.build-driver-test
  (:require
   [build-drivers.build-driver :as build-driver]
   [build-drivers.common :as c]
   [build-drivers.verify :as verify]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(defn- jar-path ^String []
  (c/driver-jar-destination-path :oracle))

(defn- jar-contains-jdbc-classes? []
  (#'verify/jar-contains-file? (jar-path) "oracle/jdbc/OracleDriver.class"))

(deftest build-oss-driver-test
  (testing "We should be able to build an OSS driver"
    (build-driver/build-driver! :oracle :oss)
    (is (.exists (java.io.File. (jar-path))))
    (testing "JAR should not contain the JDBC driver classes"
      (is (not (jar-contains-jdbc-classes?))))))

(deftest build-ee-driver-test
  (testing "We should be able to build an EE driver"
    (build-driver/build-driver! :oracle :ee)
    (is (.exists (java.io.File. (jar-path))))
    (testing "JAR *should* contain the JDBC driver classes"
      (is (jar-contains-jdbc-classes?)))))
