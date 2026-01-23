(ns ^:mb/driver-tests metabase.query-processor.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest ^:parallel native-test
  (is (=? {:rows
           [["Plato Yeshua"]
            ["Felipinho Asklepios"]
            ["Kaneonuskatew Eiran"]
            ["Simcha Yan"]
            ["Quentin Sören"]
            ["Shad Ferdynand"]
            ["Conchúr Tihomir"]
            ["Szymon Theutrich"]
            ["Nils Gotam"]
            ["Frans Hevel"]
            ["Spiros Teofil"]
            ["Kfir Caj"]
            ["Dwight Gresham"]
            ["Broen Olujimi"]
            ["Rüstem Hebel"]]
           :cols
           [{:display_name "NAME"
             :source       :native
             :field_ref    [:field "NAME" {:base-type :type/Text}]
             :name         "NAME"
             :base_type    :type/Text}]}
          (qp.test-util/rows-and-cols
           (qp/process-query
            (mt/native-query
             {:query "select name from users;"}))))))

(deftest ^:parallel native-with-duplicate-column-names-test
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    ;; TODO (Cam 10/7/25) -- this should be updated to run against all the SQL drivers, at least all the ones that
    ;; allow duplicate column names in the `SELECT` list (all of them, I think?). That was the original intention of
    ;; this test but because of a coding error it only ever ran against H2. I updated it to run against PG as well
    ;; until we can verify it works on other drivers without issue.
    #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
    (mt/test-drivers #{:h2 :postgres}
      (let [mp (lib.tu/mock-metadata-provider
                (mt/metadata-provider)
                {:cards [{:id              1
                          :dataset-query   {:native   {:query "select id, id from orders limit 1"}
                                            :database (mt/id)
                                            :type     :native}
                          :result-metadata [{:base_type      :type/BigInteger
                                             :display_name   "ID"
                                             :effective_type :type/BigInteger
                                             :field_ref      [:field "ID" {:base-type :type/BigInteger}]
                                             :fingerprint    nil
                                             :name           "ID"
                                             :semantic_type  :type/PK}
                                            {:base_type      :type/BigInteger
                                             :display_name   "ID"
                                             :effective_type :type/BigInteger
                                             :field_ref      [:field "ID_2" {:base-type :type/BigInteger}]
                                             :fingerprint    nil
                                             :name           "ID"
                                             :semantic_type  :type/PK}]}]})
            query (lib/query
                   mp
                   {:query    {:source-table "card__1"
                               :fields       [[:field "ID" {:base-type :type/Integer}]
                                              [:field "ID_2" {:base-type :type/Integer}]]}
                    :database (mt/id)
                    :type     :query})]
        (is (=? ["ID" "ID_2"]
                (map :name (mt/cols (qp/process-query query)))))))))

(deftest ^:parallel native-referring-question-referring-question-test
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    (mt/with-driver :h2
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        (mt/metadata-provider)
                                        {:cards [{:id            1
                                                  :dataset-query (mt/mbql-query products)}
                                                 {:id            2
                                                  :dataset-query {:query    {:source-table "card__1"}
                                                                  :database (u/the-id (mt/db))
                                                                  :type     :query}}]})
        (let [card-tag "#2"
              query    {:query         (format "SELECT CATEGORY, VENDOR FROM {{%s}} ORDER BY ID LIMIT 1" card-tag)
                        :template-tags {card-tag
                                        {:id           "afd1bf85-61d0-258c-99a7-a5b448728308"
                                         :name         card-tag
                                         :display-name card-tag
                                         :type         :card
                                         :card-id      2}}}]
          (is (= [["Gizmo" "Swaniawski, Casper and Hilll"]]
                 (mt/rows (qp/process-query (mt/native-query query))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Table Template Tag E2E Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest table-tag-simple-e2e-test
  (testing "Simple table tag injection returns data from the table"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (let [tag-name "input_table"
            query {:query (format "SELECT COUNT(*) AS cnt FROM {{%s}}" tag-name)
                   :template-tags {tag-name
                                   {:id "table-tag-1"
                                    :name tag-name
                                    :display-name "Input Table"
                                    :type :table
                                    :table-id (mt/id :venues)}}}]
        (is (= [[100]]
               (mt/rows (qp/process-query (mt/native-query query)))))))))

(deftest table-tag-with-partition-e2e-test
  (testing "Table tag with partition filters data correctly"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (mt/dataset test-data
        (let [tag-name "input_table"
              query {:query (format "SELECT COUNT(*) AS cnt FROM {{%s}} AS t" tag-name)
                     :template-tags {tag-name
                                     {:id "table-tag-2"
                                      :name tag-name
                                      :display-name "Input Table"
                                      :type :table
                                      :table-id (mt/id :orders)
                                      :partition-field-id (mt/id :orders :created_at)
                                      :partition-start-value "2020-01-01"
                                      :partition-end-value "2020-02-01"}}}
              result (mt/rows (qp/process-query (mt/native-query query)))]
          (is (= 1 (count result)))
          (is (number? (ffirst result)))
          (is (pos? (ffirst result))))))))

(deftest table-tag-in-join-e2e-test
  (testing "Table tag can be used in a JOIN"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (let [tag-name "venue_table"
            query {:query (format "SELECT v.NAME FROM {{%s}} AS v WHERE v.ID = 1" tag-name)
                   :template-tags {tag-name
                                   {:id "table-tag-3"
                                    :name tag-name
                                    :display-name "Venues Table"
                                    :type :table
                                    :table-id (mt/id :venues)}}}]
        (is (= [["Red Medicine"]]
               (mt/rows (qp/process-query (mt/native-query query)))))))))

(deftest table-tag-multiple-tables-e2e-test
  (testing "Multiple table tags in one query"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (let [venues-tag "venues_table"
            checkins-tag "checkins_table"
            query {:query (format "SELECT COUNT(*) FROM {{%s}} v JOIN {{%s}} c ON v.ID = c.VENUE_ID"
                                  venues-tag checkins-tag)
                   :template-tags {venues-tag
                                   {:id "table-tag-4a"
                                    :name venues-tag
                                    :display-name "Venues"
                                    :type :table
                                    :table-id (mt/id :venues)}
                                   checkins-tag
                                   {:id "table-tag-4b"
                                    :name checkins-tag
                                    :display-name "Checkins"
                                    :type :table
                                    :table-id (mt/id :checkins)}}}]
        (is (= 1 (count (mt/rows (qp/process-query (mt/native-query query))))))))))

(deftest table-tag-partition-one-sided-e2e-test
  (testing "Table tag with one-sided partition range"
    (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters)
      (mt/dataset test-data
        (testing "start only"
          (let [tag-name "input_table"
                query {:query (format "SELECT COUNT(*) FROM {{%s}} AS t" tag-name)
                       :template-tags {tag-name
                                       {:id "table-tag-5"
                                        :name tag-name
                                        :display-name "Input Table"
                                        :type :table
                                        :table-id (mt/id :orders)
                                        :partition-field-id (mt/id :orders :created_at)
                                        :partition-start-value "2025-01-01"}}}
                result (mt/rows (qp/process-query (mt/native-query query)))]
            (is (number? (ffirst result)))))
        (testing "end only"
          (let [tag-name "input_table"
                query {:query (format "SELECT COUNT(*) FROM {{%s}} AS t" tag-name)
                       :template-tags {tag-name
                                       {:id "table-tag-6"
                                        :name tag-name
                                        :display-name "Input Table"
                                        :type :table
                                        :table-id (mt/id :orders)
                                        :partition-field-id (mt/id :orders :created_at)
                                        :partition-end-value "2020-01-01"}}}
                result (mt/rows (qp/process-query (mt/native-query query)))]
            (is (number? (ffirst result)))))))))
