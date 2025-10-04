(ns metabase.query-processor-test.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
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

(deftest ^:parallel native-with-duplicate-column-names
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    (mt/with-test-drivers (sql.qp-test-util/sql-drivers)
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        (mt/metadata-provider)
                                        {:cards [{:id              1
                                                  :dataset-query   {:native   {:query "select id, id from orders"}
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
        (is (=? {:columns ["ID" "ID_2"]}
                (mt/rows+column-names
                 (qp/process-query
                  {:query    {:source-table "card__1"
                              :fields       [[:field "ID" {:base-type :type/Integer}]
                                             [:field "ID_2" {:base-type :type/Integer}]]}
                   :database (mt/id)
                   :type     :query}))))))))

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
