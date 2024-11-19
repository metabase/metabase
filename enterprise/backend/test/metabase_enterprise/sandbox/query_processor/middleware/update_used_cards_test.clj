(ns metabase-enterprise.sandbox.query-processor.middleware.update-used-cards-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.update-used-cards-test :as qp.updated-used-cards-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest sandboxing-test
  (mt/test-helpers-set-global-values!
    (qp.updated-used-cards-test/with-used-cards-setup!
      (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
        (let [gtap-card-id (:id (t2/query-one {:select [:c.id]
                                               :from   [[:report_card :c]]
                                               :left-join [[:sandboxes :s] [:= :s.card_id :c.id]]
                                               :where     [:= :s.group_id (:id &group)]}))]
          (qp.updated-used-cards-test/do-test!
           gtap-card-id
           #(qp/process-query (mt/mbql-query categories))))))))
