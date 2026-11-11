(ns metabase-enterprise.metabot.agent.user-context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.metabot.agent.user-context :as user-context]
   [metabase.test :as mt]))

(deftest adhoc-viewing-context-sandboxed-columns-test
  (testing "the column list of an ad-hoc query on a model over a column-sandboxed table shows only the allowed columns"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (mt/with-temp [:model/Card {model-id :id} {:name          "Venues model"
                                                 :type          :model
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)}}}]
        (let [out (user-context/format-viewing-context
                   {:user_is_viewing [{:type  "adhoc"
                                       :query {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table (str "card__" model-id)}}}]})]
          (doseq [column ["ID" "NAME" "CATEGORY_ID"]]
            (is (str/includes? out (str "- \"" column "\""))))
          (doseq [column ["PRICE" "LATITUDE" "LONGITUDE"]]
            (is (not (str/includes? out (str "\"" column "\""))))))))))
