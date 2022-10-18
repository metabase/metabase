(ns metabase.models.interface-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.field :refer [Field]]
   [metabase.test :as mt]
   [schema.core :as s]
   [toucan.models :as models]))

;; let's make sure the `:metabase-query`/`:metric-segment-definition`/`::dashboard-card/parameter-mappings`
;; normalization functions respond gracefully to invalid stuff when pulling them out of the Database. See #8914

(defn type-fn [toucan-type in-or-out]
  (-> @@#'models/type-fns toucan-type in-or-out))

(deftest ^:parallel handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= nil
           ((type-fn :metabase-query :out)
            (json/generate-string
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest ^:parallel template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way and disallow you from saving the invalid stuff"
    ;; TODO -- we should make sure this returns a good error message so we don't have to dig thru the exception chain.
    (is (thrown?
         Exception
         ((type-fn :metabase-query :in)
          {:database 1
           :type     :native
           :native   {:template-tags {100 [:field-id "WOW"]}}})))))

(deftest ^:parallel normalize-metric-segment-definition-test
  (testing "Legacy Metric/Segment definitions should get normalized"
    (is (= {:filter [:= [:field 1 nil] [:field 2 {:temporal-unit :month}]]}
           ((type-fn :metric-segment-definition :out)
            (json/generate-string
             {:filter [:= [:field-id 1] [:datetime-field [:field-id 2] :month]]}))))))

(deftest ^:parallel dont-explode-on-way-out-from-db-test
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
    (with-redefs [mbql.normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
      (is (= nil
             ((type-fn :parameters-list :out)
              (json/generate-string
               [{:target [:dimension [:field "ABC" nil]]}])))))))

(deftest do-not-eat-exceptions-test
  (testing "should not eat Exceptions if normalization barfs when saving"
    (is (thrown?
         Exception
         (with-redefs [mbql.normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
           ((type-fn :parameters-list :in)
            [{:target [:dimension [:field "ABC" nil]]}]))))))

(deftest timestamped-property-do-not-stomp-on-explicit-values-test
  (testing "The :timestamped property should not stomp on :created_at/:updated_at if they are explicitly specified"
    (mt/with-temp Field [field]
      (testing "Nothing specified: use now() for both"
        (is (schema= {:created_at java.time.temporal.Temporal
                      :updated_at java.time.temporal.Temporal
                      s/Keyword   s/Any}
                     field))))
    (let [t        #t "2022-10-13T19:21:00Z"
          t-schema (s/eq (case (mdb.connection/db-type)
                           ;; not sure why this is TIMESTAMP WITH TIME ZONE for Postgres but not for H2/MySQL. :shrug:
                           :postgres    (t/offset-date-time "2022-10-13T19:21:00Z")
                           (:h2 :mysql) (t/local-date-time "2022-10-13T19:21:00")))]
      (testing "Explicitly specify :created_at"
        (mt/with-temp Field [field {:created_at t}]
          (is (schema= {:created_at t-schema
                        :updated_at java.time.temporal.Temporal
                        s/Keyword   s/Any}
                       field))))
      (testing "Explicitly specify :updated_at"
        (mt/with-temp Field [field {:updated_at t}]
          (is (schema= {:created_at java.time.temporal.Temporal
                        :updated_at t-schema
                        s/Keyword   s/Any}
                       field)))))))
