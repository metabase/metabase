(ns metabase.public-sharing.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.db :as actions.db]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.documents.db :as documents.db]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.db :as queries.db]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]))

(deftest prefix-lookups-bind-the-prefix-test
  (testing "GHY-4587: each prefix lookup binds `prefix` as a parameter"
    (let [uuid   (str (random-uuid))
          prefix (public-sharing/public-uuid-prefix uuid)]
      (mt/with-temp [:model/Card      {card-id :id}      {:public_uuid uuid}
                     :model/Dashboard {dashboard-id :id} {:public_uuid uuid}
                     :model/Document  {document-id :id}  {:name "Shared Doc" :public_uuid uuid}]
        (testing "a matching prefix finds the row"
          (is (= [card-id] (map :id (queries.db/unarchived-card-ids-and-public-uuids-by-prefix {:prefix prefix}))))
          (is (= [dashboard-id] (map :id (dashboards.db/unarchived-dashboard-ids-and-public-uuids-by-prefix {:prefix prefix}))))
          (is (= [document-id] (map :id (documents.db/unarchived-documents-by-public-uuid-prefix {:prefix prefix :columns [:id :public_uuid]}))))
          (is (= [card-id] (map :id (queries.db/unarchived-cards-by-public-uuid-prefix {:prefix prefix}))))
          (is (= [dashboard-id] (map :id (dashboards.db/unarchived-dashboards-by-public-uuid-prefix {:prefix prefix}))))
          (is (= [document-id] (map :id (documents.db/unarchived-documents-by-public-uuid-prefix {:prefix prefix})))))
        (testing "a prefix that looks like SQL is compared as a string, matching nothing"
          (let [hostile (str prefix "' OR '1'='1")]
            (is (empty? (queries.db/unarchived-card-ids-and-public-uuids-by-prefix {:prefix hostile})))
            (is (empty? (queries.db/unarchived-cards-by-public-uuid-prefix {:prefix hostile})))))))
    (mt/with-actions-enabled
      (let [uuid (str (random-uuid))]
        (mt/with-actions [{action-id :action-id} {:public_uuid uuid :made_public_by_id (mt/user->id :crowberto)}]
          (let [prefix (public-sharing/public-uuid-prefix uuid)]
            (is (= [action-id] (map :id (actions.db/unarchived-action-ids-and-public-uuids-by-prefix {:prefix prefix}))))
            (is (= [action-id] (map :id (actions.db/unarchived-actions-by-public-uuid-prefix {:prefix prefix}))))))))
    (testing "a non-string prefix is rejected before it reaches the query"
      (is (thrown? clojure.lang.ExceptionInfo
                   (queries.db/unarchived-cards-by-public-uuid-prefix {:prefix {:raw "(SELECT 1)"}}))))))

(deftest prefix-lookups-bind-the-prefix-without-the-schema-test
  (testing "GHY-4587: with the schema off, the marker rejects an operator-shaped prefix instead of compiling it into the WHERE"
    ;; An unmarked `[:not= "x"]` in the kv-arg slot compiles to `public_uuid_prefix <> 'x'` and matches every shared row.
    (mt/with-temp [:model/Card      _ {:public_uuid (str (random-uuid))}
                   :model/Dashboard _ {:public_uuid (str (random-uuid))}
                   :model/Document  _ {:name "Shared Doc" :public_uuid (str (random-uuid))}]
      (mu/disable-enforcement
        (doseq [lookup [queries.db/unarchived-card-ids-and-public-uuids-by-prefix
                        queries.db/unarchived-cards-by-public-uuid-prefix
                        documents.db/unarchived-documents-by-public-uuid-prefix
                        dashboards.db/unarchived-dashboard-ids-and-public-uuids-by-prefix
                        actions.db/unarchived-action-ids-and-public-uuids-by-prefix
                        dashboards.db/unarchived-dashboards-by-public-uuid-prefix
                        actions.db/unarchived-actions-by-public-uuid-prefix]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                (doall (lookup {:prefix [:not= "zzzzzzzz"]})))))))))
