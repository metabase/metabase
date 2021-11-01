(ns metabase.driver-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.impl :as impl]
            [metabase.plugins.classloader :as classloader]
            [metabase.test.data.env :as tx.env]))

(driver/register! ::test-driver, :abstract? true)

(defmethod driver/supports? [::test-driver :foreign-keys] [_ _] true)
(defmethod driver/database-supports? [::test-driver :foreign-keys] [_ _ db] (= db "dummy"))


(deftest driver-supports?-test
  (is (driver/supports? ::test-driver :foreign-keys))
  (is (not (driver/supports? ::test-driver :expressions)))
  (is (thrown-with-msg? java.lang.Exception #"Invalid driver feature: .*"
               (driver/supports? ::test-driver :some-made-up-thing))))

(deftest database-supports?-test
  (is (driver/database-supports? ::test-driver :foreign-keys "dummy"))
  (is (not (driver/database-supports? ::test-driver :foreign-keys "not-dummy")))
  (is (not (driver/database-supports? ::test-driver :expressions "dummy")))
  (is (thrown-with-msg? java.lang.Exception #"Invalid driver feature: .*"
               (driver/database-supports? ::test-driver :some-made-up-thing "dummy"))))

(deftest the-driver-test
  (testing (str "calling `the-driver` should set the context classloader, important because driver plugin code exists "
                "there but not elsewhere")
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (driver/the-driver :h2)
    (is (= @@#'classloader/shared-context-classloader
           (.getContextClassLoader (Thread/currentThread))))))

(deftest available?-test
  (with-redefs [impl/concrete? (constantly true)]
    (is (driver/available? ::test-driver))
    (is (driver/available? "metabase.driver-test/test-driver")
        "`driver/available?` should work for if `driver` is a string -- see #10135")))

(deftest unique-connection-property-test
  ;; abnormal usage here; we are not using the regular mt/test-driver or mt/test-drivers, because those involve
  ;; initializing the driver and test data namespaces, which don't necessarily exist for all drivers (ex:
  ;; googleanalytics), and besides which, we don't actually need sample data or test extensions for this test itself

  ;; so instead, just iterate through all drivers currently set to test by the environment, and check their
  ;; connection-properties; between all the different CI driver runs, this should cover everything
  (doseq [d (tx.env/test-drivers)]
    (testing (str d " has entirely unique connection property names")
      (let [props         (driver/connection-properties d)
            props-by-name (group-by :name props)]
        (is (= (count props) (count props-by-name))
            (format "Property(s) with duplicate name: %s" (-> (filter (fn [[_ props]]
                                                                        (> (count props) 1))
                                                                      props-by-name)
                                                              vec
                                                              pr-str)))))))
