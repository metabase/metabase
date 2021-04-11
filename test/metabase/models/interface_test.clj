(ns metabase.models.interface-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.mbql.normalize :as normalize]
            [toucan.models :as t.models]))

;; let's make sure the `:metabase-query`/`:metric-segment-definition`/`:parameter-mappings` normalization functions
;; respond gracefully to invalid stuff when pulling them out of the Database. See #8914

(defn- type-fn [toucan-type in-or-out]
  (-> @@#'t.models/type-fns toucan-type in-or-out))

(deftest handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= nil
           ((type-fn :metabase-query :out)
            (json/generate-string
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way and disallow you from saving the invalid stuff"
    ;; TODO -- we should make sure this returns a good error message so we don't have to dig thru the exception chain.
    (is (thrown?
         Exception
         ((type-fn :metabase-query :in)
          {:database 1
           :type     :native
           :native   {:template-tags {100 [:field-id "WOW"]}}})))))

(deftest normalize-metric-segment-definition-test
  (testing "Legacy Metric/Segment definitions should get normalized"
    (is (= {:filter [:= [:field 1 nil] [:field 2 {:temporal-unit :month}]]}
           ((type-fn :metric-segment-definition :out)
            (json/generate-string
             {:filter [:= [:field-id 1] [:datetime-field [:field-id 2] :month]]}))))))

(deftest dont-explode-on-way-out-from-db-test
  (testing "`metric-segment-definition`s should avoid explosions coming out of the DB..."
    (is (= nil
           ((type-fn :metric-segment-definition :out)
            (json/generate-string
             {:filter 1000}))))

    (testing "...but should still throw them coming in"
      (is (thrown?
           Exception
           ((type-fn :metric-segment-definition :in)
            {:filter 1000}))))))

(deftest handle-errors-gracefully-test
  (testing (str "Cheat and override the `normalization-tokens` function to always throw an Exception so we can make "
                "sure the Toucan type fn handles the error gracefully")
    (with-redefs [normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
      (is (= nil
             ((type-fn :parameter-mappings :out)
              (json/generate-string
               [{:target [:dimension [:field "ABC" nil]]}])))))))

(deftest do-not-eat-exceptions-test
  (testing "should not eat Exceptions if normalization barfs when saving"
    (is (thrown?
         Exception
         (with-redefs [normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
           ((type-fn :parameter-mappings :in)
            [{:target [:dimension [:field "ABC" nil]]}]))))))

(deftest normalize-parameter-mappings-test
  (testing "make sure parameter mappings correctly normalize things like legacy MBQL clauses"
    (is (= [{:target [:dimension [:field 30 {:source-field 23}]]}]
           ((type-fn :parameter-mappings :out)
            (json/generate-string
             [{:target [:dimension [:fk-> 23 30]]}]))))

    (testing "...but parameter mappings we should not normalize things like :target"
      (is (= [{:card-id 123, :hash "abc", :target "foo"}]
             ((type-fn :parameter-mappings :out)
              (json/generate-string
               [{:card-id 123, :hash "abc", :target "foo"}])))))))

(deftest keep-empty-parameter-mappings-empty-test
  (testing (str "we should keep empty parameter mappings as empty instead of making them nil (if `normalize` removes "
                "them because they are empty) (I think this is to prevent NPEs on the FE? Not sure why we do this)")
    (is (= []
           ((type-fn :parameter-mappings :out)
            (json/generate-string []))))))
