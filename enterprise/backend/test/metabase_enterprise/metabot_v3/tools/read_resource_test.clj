(ns metabase-enterprise.metabot-v3.tools.read-resource-test
  "Tests for read_resource tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.read-resource :as read-resource]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest parse-uri-test
  (testing "parses table URI"
    (is (= {:resource-type "table"
            :resource-id "123"
            :sub-resource nil
            :sub-resource-id nil}
           (#'read-resource/parse-uri "metabase://table/123"))))

  (testing "parses table with fields sub-resource"
    (is (= {:resource-type "table"
            :resource-id "123"
            :sub-resource "fields"
            :sub-resource-id nil}
           (#'read-resource/parse-uri "metabase://table/123/fields"))))

  (testing "parses table with specific field"
    (is (= {:resource-type "table"
            :resource-id "123"
            :sub-resource "fields"
            :sub-resource-id "456"}
           (#'read-resource/parse-uri "metabase://table/123/fields/456"))))

  (testing "parses field ID with slash"
    (is (= {:resource-type "table"
            :resource-id "123"
            :sub-resource "fields"
            :sub-resource-id "c75/17"}
           (#'read-resource/parse-uri "metabase://table/123/fields/c75/17"))))

  (testing "parses model URI"
    (is (= {:resource-type "model"
            :resource-id "456"
            :sub-resource nil
            :sub-resource-id nil}
           (#'read-resource/parse-uri "metabase://model/456"))))

  (testing "parses metric with dimensions"
    (is (= {:resource-type "metric"
            :resource-id "789"
            :sub-resource "dimensions"
            :sub-resource-id nil}
           (#'read-resource/parse-uri "metabase://metric/789/dimensions"))))

  (testing "rejects invalid scheme"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "https://example.com"))))

  (testing "rejects incomplete URI"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "metabase://table")))))

(deftest read-resource-validation-test
  (testing "rejects too many URIs"
    (let [uris (vec (repeat 10 "metabase://table/123"))]
      (is (thrown-with-msg? Exception #"Too many URIs"
                            (read-resource/read-resource {:uris uris}))))))

(deftest read-table-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id :name "Test Table"}]
        (testing "fetches basic table info"
          (let [result (read-resource/read-resource
                        {:uris [(str "metabase://table/" table-id)]})
                resources (:resources result)]
            (is (= 1 (count resources)))
            (is (contains? (first resources) :content))
            (is (nil? (:error (first resources))))))

        (testing "fetches table with fields"
          (let [result (read-resource/read-resource
                        {:uris [(str "metabase://table/" table-id "/fields")]})
                resources (:resources result)]
            (is (= 1 (count resources)))
            (is (contains? (first resources) :content))))

        (testing "handles multiple URIs"
          (let [result (read-resource/read-resource
                        {:uris [(str "metabase://table/" table-id)
                                (str "metabase://table/" table-id "/fields")]})
                resources (:resources result)]
            (is (= 2 (count resources)))
            (is (every? #(contains? % :content) resources))))

        (testing "returns errors for invalid URIs"
          (let [result (read-resource/read-resource
                        {:uris ["metabase://table/99999"]})
                resources (:resources result)]
            (is (= 1 (count resources)))
            (is (contains? (first resources) :error))))))))

(deftest format-resources-test
  (testing "formats resources with content"
    (let [resources [{:uri "metabase://table/123"
                      :content "Table details here"}]
          formatted (#'read-resource/format-resources resources)]
      (is (str/includes? formatted "<resources>"))
      (is (str/includes? formatted "<resource uri=\"metabase://table/123\">"))
      (is (str/includes? formatted "Table details here"))
      (is (str/includes? formatted "</resource>"))
      (is (str/includes? formatted "</resources>"))))

  (testing "formats resources with errors"
    (let [resources [{:uri "metabase://table/123"
                      :error "Table not found"}]
          formatted (#'read-resource/format-resources resources)]
      (is (str/includes? formatted "**Error:** Table not found")))))
