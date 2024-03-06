(ns metabase.query-processor-test.native-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.models.card :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel native-test
  (is (= {:rows
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
            :base_type    :type/Text
            :effective_type :type/Text}]}
         (qp.test-util/rows-and-cols
          (qp/process-query
           (mt/native-query
            {:query "select name from users;"}))))))

(deftest ^:parallel native-with-duplicate-column-names
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    (mt/with-test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
      (let [native-query {:native {:query "select id, id from orders"}
                          :database (mt/id)
                          :type :native}
            results (qp/process-query native-query)]
        (t2.with-temp/with-temp [:model/Card card {:dataset_query native-query
                                                   :result_metadata (get-in results [:results_metadata :columns]) }]
          (is (=? {:columns ["id" "id_2"]}
                  (mt/rows+column-names
                    (qp/process-query
                      {:query {:source-table (str "card__" (:id card))
                               :fields [[:field "id" {:base-type :type/Integer}] [:field "id_2" {:base-type :type/Integer}]]}
                       :database (mt/id)
                       :type :query})))))))))

(deftest ^:parallel native-referring-question-referring-question-test
  (testing "Should be able to run native query referring a question referring a question (#25988)"
    (mt/with-driver :h2
      (mt/dataset test-data
        (t2.with-temp/with-temp [Card card1 {:dataset_query (mt/mbql-query products)}
                                 Card card2 {:dataset_query {:query {:source-table (str "card__" (u/the-id card1))}
                                                             :database (u/the-id (mt/db))
                                                             :type :query}}]
          (let [card-tag (str "#" (u/the-id card2))
                query    {:query         (format "SELECT CATEGORY, VENDOR FROM {{%s}} ORDER BY ID LIMIT 1" card-tag)
                          :template-tags {card-tag
                                          {:id           "afd1bf85-61d0-258c-99a7-a5b448728308"
                                           :name         card-tag
                                           :display-name card-tag
                                           :type         :card
                                           :card-id      (u/the-id card2)}}}]
            (is (= [["Gizmo" "Swaniawski, Casper and Hilll"]]
                   (mt/rows (qp/process-query (mt/native-query query)))))))))))
