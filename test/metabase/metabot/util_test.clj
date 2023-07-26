(ns metabase.metabot.util-test
  (:require
   [clojure.test :refer :all]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :as models]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]
   [metabase.metabot.schema :as metabot-schema]
   [metabase.metabot.metabot-test-models :as mtm]))

(deftest model->context-test
  (testing "The context generated from a model should conform to the schema."
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (mtm/full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [models/Card model {:table_id      (mt/id :orders)
                               :dataset_query source-query
                               :dataset       true}]
            (let [context [(metabot-util/model->context model)]]
              (is (true? (mc/validate metabot-schema/context-schema context)))
              context)))))))

(deftest model->summary-test
  (testing "The summary text of a model (used for embedding matching) should be a string"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (mtm/full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [models/Card model {:name          "Custom Model"
                               :table_id      (mt/id :orders)
                               :dataset_query source-query
                               :dataset       true}]
            (let [expected (str/join
                            ","
                            ["Custom Model: Created At" "Discount" "ID" "Product ID" "Quantity"
                             "Subtotal" "Tax" "Total" "User ID"
                             "u → Address" "u → Birth Date" "u → City" "u → Created At" "u → Email" "u → ID"
                             "u → Latitude" "u → Longitude" "u → Name" "u → Password"
                             "u → Source" "u → State" "u → Zip"
                             "p → Category" "p → Created At" "p → Ean" "p → ID" "p → Price"
                             "p → Rating" "p → Title" "p → Vendor"])
                  summary  (metabot-util/model->summary model)]
              (is (= expected summary)))))))))
