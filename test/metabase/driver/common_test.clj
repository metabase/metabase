(ns ^:mb/driver-tests metabase.driver.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest ^:parallel base-type-inference-test
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" "B" "C"])))
  (testing "should work with just one value"
    (is (= :type/Text
           (transduce identity (driver.common/values->base-type) ["A"]))))
  (testing "should work with just one value"
    (is (= :type/*
           (transduce identity (driver.common/values->base-type) []))))
  (testing "should work with a lot of values"
    (is (= :type/Integer
           (transduce identity (driver.common/values->base-type) (range 10000)))))
  (is (= :type/Text
         (transduce identity (driver.common/values->base-type) ["A" 100 "C"])))
  (is (= :type/*
         (transduce identity (driver.common/values->base-type) [(Object.)])))
  (testing "Base type inference should work with initial nils even if sequence is lazy"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [nil nil nil]
                                                                              (do (reset! realized-lazy-seq? true)
                                                                                  [4 5 6])))
              @realized-lazy-seq?]))))
  (testing "Base type inference should respect laziness and not keep scanning after it finds 100 values"
    (let [realized-lazy-seq? (atom false)]
      (is (= [:type/Integer true]
             [(transduce identity (driver.common/values->base-type) (lazy-cat [1 2 3]
                                                                              (repeat 1000 nil)
                                                                              (do (reset! realized-lazy-seq? true)
                                                                                  [4 5 6])))
              @realized-lazy-seq?])))))

(defn- test-start-of-week-offset!
  [db-start-of-week target-start-of-week]
  (with-redefs [driver/db-start-of-week   (constantly db-start-of-week)
                setting/get-value-of-type (constantly target-start-of-week)]
    (driver.common/start-of-week-offset :sql)))

(deftest start-of-week-offset-test
  (is (= 0 (test-start-of-week-offset! :sunday :sunday)))
  (is (= -1 (test-start-of-week-offset! :sunday :monday)))
  (is (= 1 (test-start-of-week-offset! :monday :sunday)))
  (is (= 5 (test-start-of-week-offset! :monday :wednesday))))

(deftest cloud-ip-address-info-test
  (testing "The cloud-ip-address-info field is correctly resolved when fetching driver connection properties"
    (mt/with-temp-env-var-value! [mb-cloud-gateway-ips "1.2.3.4,5.6.7.8"]
      (with-redefs [premium-features/is-hosted? (constantly true)]
        ;; make sure Postgres driver is initialized before trying to get its connection properties.
        (driver/the-initialized-driver :postgres)
        (let [connection-props (-> (driver.u/available-drivers-info)
                                   :postgres
                                   :details-fields)
              ip-address-field (first (filter #(= (:name %) "cloud-ip-address-info") connection-props))]
          (is (re-find #"If your database is behind a firewall" (:placeholder ip-address-field))))))))

(deftest ^:parallel json-unfolding-default-test
  (testing "JSON Unfolding database support details behave as they're supposed to"
    #_{:clj-kondo/ignore [:equals-true]}
    (are [details expected] (= expected
                               (driver.common/json-unfolding-default {:details details}))
      {}                      true
      {:json-unfolding nil}   true
      {:json-unfolding true}  true
      {:json-unfolding false} false)))

(deftest ^:parallel json-decimals-keep-precision-test
  (testing "json fields with decimals maintain their decimal places"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (mt/dataset (mt/dataset-definition "json-decimals-db"
                                         ["json-decimals-table"
                                          [{:field-name "json-field" :base-type :type/JSON}]
                                          [["{\"A\": 123, \"B\": 0.456, \"C\": 0.789}"]
                                           ["{\"A\": 456, \"B\": 0.789, \"C\": 789}"]]])
        (when-not (mysql/mariadb? (mt/db))
          (is (= [[1 123.0 0.456 0.789]
                  [2 456.0 0.789 789.0]]
                 (mt/formatted-rows [int double double double]
                                    (mt/run-mbql-query json-decimals-table)))))))))
