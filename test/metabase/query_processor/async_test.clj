(ns metabase.query-processor.async-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.async :as qp.async]
   [metabase.test :as mt]
   [metabase.test.util.async :as tu.async]))

(deftest ^:parallel async-result-metadata-test
  (testing "Should be able to get result metadata async"
    (testing "MBQL query: should be able to return results immediately"
      (tu.async/with-open-channels [result-chan (qp.async/result-metadata-for-query-async
                                                 {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (mt/id :venues)
                                                             :fields       [[:field (mt/id :venues :name) nil]]}})]
        (is (=? [{:name              "NAME"
                  :display_name      "Name"
                  :base_type         :type/Text
                  :coercion_strategy nil
                  :effective_type    :type/Text
                  :semantic_type     :type/Name
                  :fingerprint       {:global {:distinct-count 100, :nil% 0.0}
                                      :type   #:type {:Text
                                                      {:percent-json   0.0
                                                       :percent-url    0.0
                                                       :percent-email  0.0
                                                       :percent-state  0.0
                                                       :average-length 15.63}}}
                  :description       nil
                  :table_id          (mt/id :venues)
                  :settings          nil
                  :source            :fields
                  :nfc_path          nil
                  :parent_id         nil
                  :visibility_type   :normal
                  :id                (mt/id :venues :name)
                  :field_ref         [:field (mt/id :venues :name) nil]}]
                (mt/wait-for-result result-chan 1000)))))))

(deftest ^:parallel async-result-metadata-native-query-test
  (testing "Should be able to get result metadata async"
    (testing "Native query: results should be returned asynchronously"
      (tu.async/with-open-channels [result-chan (qp.async/result-metadata-for-query-async
                                                 {:database (mt/id)
                                                  :type     :native
                                                  :native   {:query "SELECT NAME FROM VENUES LIMIT 1;"}})]
        (is (=? [{:name           "NAME"
                  :field_ref      [:field "NAME" {:base-type :type/Text}]
                  :base_type      :type/Text
                  :effective_type :type/Text
                  :semantic_type  :type/Name
                  :fingerprint    {:global {:distinct-count 1, :nil% 0.0}
                                   :type   {:type/Text
                                            {:percent-json   0.0
                                             :percent-url    0.0
                                             :percent-email  0.0
                                             :percent-state  0.0
                                             :average-length 12.0}}}}]
                (mt/wait-for-result result-chan 1000)))))))
