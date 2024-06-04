(ns metabase.models.interface-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.table :refer [Table]]
   [metabase.test.util.log :as tu.log]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import (com.fasterxml.jackson.core JsonParseException)))

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

(deftest ^:parallel normalize-empty-query-test
  (is (= {}
         ((:out mi/transform-metabase-query) "{}"))))

(deftest ^:parallel normalize-metric-segment-definition-test
  (testing "Legacy Metric/Segment definitions should get normalized"
    (is (= {:filter [:= [:field 1 nil] [:field 2 {:temporal-unit :month}]]}
           ((:out mi/transform-legacy-metric-segment-definition)
            (json/generate-string
             {:filter [:= [:field-id 1] [:datetime-field [:field-id 2] :month]]}))))))

(deftest ^:parallel dont-explode-on-way-out-from-db-test
  (testing "`metric-segment-definition`s should avoid explosions coming out of the DB..."
    (is (= nil
           ((:out mi/transform-legacy-metric-segment-definition)
            (json/generate-string
             {:filter 1000}))))

    (testing "...but should still throw them coming in"
      (is (thrown?
           Exception
           ((:in mi/transform-legacy-metric-segment-definition)
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
        (is (=? {:created_at java.time.temporal.Temporal
                 :updated_at java.time.temporal.Temporal}
                field))))
    (let [t                  #t "2022-10-13T19:21:00Z"
          expected-timestamp (t/offset-date-time "2022-10-13T19:21:00Z")]
      (testing "Explicitly specify :created_at"
        (t2.with-temp/with-temp [Field field {:created_at t}]
          (is (=? {:created_at expected-timestamp
                   :updated_at java.time.temporal.Temporal}
                  field))))
      (testing "Explicitly specify :updated_at"
        (t2.with-temp/with-temp [Field field {:updated_at t}]
          (is (=? {:created_at java.time.temporal.Temporal
                   :updated_at expected-timestamp}
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

(deftest encrypted-data-with-no-secret-test
  (encryption-test/with-secret-key nil
    (testing "Just parses string normally when there is no key and the string is JSON"
      (is (= {:a 1}
             (mi/encrypted-json-out "{\"a\": 1}"))))
    (testing "Also parses string if it's encrypted and JSON"
      (is (= {:a 1}
             (encryption-test/with-secret-key "qwe"
               (mi/encrypted-json-out
                (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1}"))))))
    (testing "Logs an error message when incoming data looks encrypted"
      (is (=? [[:error JsonParseException "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?"]]
              (tu.log/with-log-messages-for-level :error
                (mi/encrypted-json-out
                 (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1}"))))))
    (testing "Invalid JSON throws correct error"
      (is (=? [[:error JsonParseException "Error parsing JSON"]]
              (tu.log/with-log-messages-for-level :error
                (mi/encrypted-json-out "{\"a\": 1"))))
      (is (=? [[:error JsonParseException "Error parsing JSON"]]
              (tu.log/with-log-messages-for-level :error
                (encryption-test/with-secret-key "qwe"
                  (mi/encrypted-json-out
                   (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1")))))))))

(deftest instances-with-hydrated-data-test
  (let [things [{:id 2} nil {:id 1}]]
    (is (= [{:id 2 :even-id? true} nil {:id 1 :even-id? false}]
           (mi/instances-with-hydrated-data
             things :even-id?
             #(into {} (comp (remove nil?)
                             (map (juxt :id (comp even? :id))))
                    things)
             :id)))))
