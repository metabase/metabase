(ns metabase.models.interface-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.table :refer [Table]]
   [metabase.util :as u]
   [schema.core :as s]
   [toucan.models :as models]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;; let's make sure the `transform-metabase-query`/`transform-metric-segment-definition`/`transform-parameters-list`
;; normalization functions respond gracefully to invalid stuff when pulling them out of the Database. See #8914

(deftest ^:parallel handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= nil
           ((:out mi/transform-metabase-query)
            (json/generate-string
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest ^:parallel template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way and disallow you from saving the invalid stuff"
    ;; TODO -- we should make sure this returns a good error message so we don't have to dig thru the exception chain.
    (is (thrown?
         Exception
         ((:in mi/transform-metabase-query)
          {:database 1
           :type     :native
           :native   {:template-tags {100 [:field-id "WOW"]}}})))))

(deftest ^:parallel normalize-metric-segment-definition-test
  (testing "Legacy Metric/Segment definitions should get normalized"
    (is (= {:filter [:= [:field 1 nil] [:field 2 {:temporal-unit :month}]]}
           ((:out mi/transform-metric-segment-definition)
            (json/generate-string
             {:filter [:= [:field-id 1] [:datetime-field [:field-id 2] :month]]}))))))

(deftest ^:parallel dont-explode-on-way-out-from-db-test
  (testing "`metric-segment-definition`s should avoid explosions coming out of the DB..."
    (is (= nil
           ((:out mi/transform-metric-segment-definition)
            (json/generate-string
             {:filter 1000}))))

    (testing "...but should still throw them coming in"
      (is (thrown?
           Exception
           ((:in mi/transform-metric-segment-definition)
            {:filter 1000}))))))

(deftest handle-errors-gracefully-test
  (testing (str "Cheat and override the `normalization-tokens` function to always throw an Exception so we can make "
                "sure the Toucan type fn handles the error gracefully")
    (with-redefs [mbql.normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
      (is (= nil
             ((:out mi/transform-parameters-list)
              (json/generate-string
               [{:target [:dimension [:field "ABC" nil]]}])))))))

(deftest do-not-eat-exceptions-test
  (testing "should not eat Exceptions if normalization barfs when saving"
    (is (thrown?
         Exception
         (with-redefs [mbql.normalize/normalize-tokens (fn [& _] (throw (Exception. "BARF")))]
           ((:in mi/transform-parameters-list)
            [{:target [:dimension [:field "ABC" nil]]}]))))))

(deftest timestamped-property-test
  (testing "Make sure updated_at gets updated for timestamped models"
    (t2.with-temp/with-temp [Table table {:updated_at #t "2023-02-02T01:00:00"}]
      (let [updated-at (:updated_at table)
            new-name   (u/qualified-name ::a-new-name)]
        (is (= 1
               (t2/update! table (u/the-id table) {:name new-name})))
        (is (=? {:id         (:id table)
                 :name       new-name
                 :updated_at (partial not= updated-at)}
                (t2/select-one [Table :id :name :updated_at] (u/the-id table))))))))

(deftest timestamped-property-do-not-stomp-on-explicit-values-test
  (testing "The :timestamped property should not stomp on :created_at/:updated_at if they are explicitly specified"
    (t2.with-temp/with-temp [Field field]
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
        (t2.with-temp/with-temp [Field field {:created_at t}]
          (is (schema= {:created_at t-schema
                        :updated_at java.time.temporal.Temporal
                        s/Keyword   s/Any}
                       field))))
      (testing "Explicitly specify :updated_at"
        (t2.with-temp/with-temp [Field field {:updated_at t}]
          (is (schema= {:created_at java.time.temporal.Temporal
                        :updated_at t-schema
                        s/Keyword   s/Any}
                       field)))))))

(deftest ^:parallel upgrade-to-v2-viz-settings-test
  (let [migrate #(select-keys (#'mi/migrate-viz-settings %)
                              [:version :pie.percent_visibility])]
    (testing "show_legend -> inside"
      (is (= {:version 2
              :pie.percent_visibility "inside"}
             (migrate {:pie.show_legend          true
                       :pie.show_legend_perecent true
                       :pie.show_data_labels     true}))))
    (testing "show_legend_percent -> legend"
      (is (= {:version 2
              :pie.percent_visibility "legend"}
             (migrate {:pie.show_legend          false
                       :pie.show_legend_perecent true
                       :pie.show_data_labels     true}))))
    (testing "anything else -> nothing"
      (doseq [legend  [false nil]
              percent [false nil]
              labels  [true false nil]]
        (is (= {}
               (migrate {:pie.show_legend          legend
                         :pie.show_legend_perecent percent
                         :pie.show_data_labels     labels})))))))
