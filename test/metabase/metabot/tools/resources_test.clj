(ns metabase.metabot.tools.resources-test
  "Tests for read_resource tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

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

  (testing "parses question URI"
    (is (= {:resource-type "question"
            :resource-id "456"
            :sub-resource nil
            :sub-resource-id nil}
           (#'read-resource/parse-uri "metabase://question/456"))))

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

(comment
  (mt/with-current-user (mt/user->id :crowberto)
    (read-resource/read-resource
     {:uris [(str "metabase://table/" 1)]})))

(deftest read-table-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id :name "Test Table"}]
        (testing "fetches basic table info"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id)]}))))

        (testing "fetches table with fields"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id "/fields")]}))))

        (testing "handles multiple URIs"
          (is (=? {:resources [{:content {:structured-output map?}}
                               {:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id)
                           (str "metabase://table/" table-id "/fields")]}))))

        (testing "returns errors for invalid URIs"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource
                   {:uris ["metabase://table/99999"]}))))))))

(deftest read-table-resource-excludes-related-tables-test
  (testing "table resources should not include related_tables (to avoid bloated responses)"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        ;; Use orders table which has FK relationships to other tables
        (let [orders-id (mt/id :orders)]
          (testing "metabase://table/:id excludes related_tables"
            (let [result (read-resource/read-resource
                          {:uris [(str "metabase://table/" orders-id)]})
                  output (get-in result [:resources 0 :content :structured-output])]
              (is (nil? (:related_tables output))
                  "table resource should not include related_tables")))

          (testing "metabase://table/:id/fields excludes related_tables"
            (let [result (read-resource/read-resource
                          {:uris [(str "metabase://table/" orders-id "/fields")]})
                  output (get-in result [:resources 0 :content :structured-output])]
              (is (nil? (:related_tables output))
                  "table/fields resource should not include related_tables"))))))))

(deftest read-dashboard-resource-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id dashboard-name :name}
                   {:name "Sales Overview"}]
      (testing "fetches dashboard info"
        (let [result (read-resource/read-resource {:uris [(str "metabase://dashboard/" dashboard-id)]})]
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  result))
          (is (str/includes? (:output result) dashboard-name))))

      (testing "rejects sub-resources"
        (is (=? {:resources [{:error string?}]}
                (read-resource/read-resource {:uris [(str "metabase://dashboard/" dashboard-id "/cards")]}))))

      (testing "returns error for unknown dashboard"
        (is (=? {:resources [{:error string?}]}
                (read-resource/read-resource {:uris ["metabase://dashboard/99999"]})))))))

(deftest read-transform-resource-test
  (mt/with-premium-features #{:transforms}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id transform-name :name}
                     {:name   "Gadget Products"
                      :source {:type  "query"
                               :query (lib/native-query (mt/metadata-provider)
                                                        "SELECT * FROM products WHERE category = 'Gadget'")}}]
        (testing "fetches transform info"
          (let [result (read-resource/read-resource {:uris [(str "metabase://transform/" transform-id)]})]
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    result))
            (is (str/includes? (:output result) transform-name))))

        (testing "rejects sub-resources"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource {:uris [(str "metabase://transform/" transform-id "/fields")]}))))

        (testing "returns error for unknown transform"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource {:uris ["metabase://transform/99999"]}))))))))

(deftest format-resources-test
  (testing "formats resources with content"
    (let [resources [{:uri "metabase://table/123"
                      :content {:formatted "Table details here"}}]
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

(deftest read-question-resource-test
  (let [mp (mt/metadata-provider)
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (m/find-first (comp #{"Category"} :display-name)
                                              (lib/breakoutable-columns $))))
        metadata (-> query
                     qp/process-query
                     :data :results_metadata :columns)]

    (mt/with-temp
      [:model/Card {question-id :id} {:name "My fav card"
                                      :dataset_query query
                                      :result_metadata metadata}]
      (mt/with-test-user :crowberto
        (let [read-result (read-resource/read-resource-tool
                           {:uris [(str "metabase://question/" question-id "/fields")]})
              output (:output read-result)
              structured (get-in read-result [:resources 0 :content :structured-output])]
          (testing "Output references expected fields"
            (is (re-find #"display_name\S+Count" output))
            (is (re-find #"display_name\S+Category" output)))
          (testing "Structured output contains expected fields"
            (is (=? {:fields [{:display_name "Category"}
                              {:display_name "Count"}]}
                    structured))))))))

