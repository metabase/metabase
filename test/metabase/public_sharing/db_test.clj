(ns metabase.public-sharing.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.test :as mt]))

(deftest prefix-lookups-bind-the-prefix-test
  (testing "GHY-4587: each prefix lookup binds `prefix` as a parameter"
    (let [uuid   (str (random-uuid))
          prefix (public-sharing/public-uuid-prefix uuid)]
      (mt/with-temp [:model/Card      {card-id :id}      {:public_uuid uuid}
                     :model/Dashboard {dashboard-id :id} {:public_uuid uuid}
                     :model/Document  {document-id :id}  {:name "Shared Doc" :public_uuid uuid}]
        (testing "a matching prefix finds the row"
          (is (= [card-id] (map :id (public-sharing.db/unarchived-card-ids-and-public-uuids-by-prefix prefix))))
          (is (= [dashboard-id] (map :id (public-sharing.db/unarchived-dashboard-ids-and-public-uuids-by-prefix prefix))))
          (is (= [document-id] (map :id (public-sharing.db/unarchived-document-ids-and-public-uuids-by-prefix prefix))))
          (is (= [card-id] (map :id (public-sharing.db/unarchived-cards-by-public-uuid-prefix prefix))))
          (is (= [dashboard-id] (map :id (public-sharing.db/unarchived-dashboards-by-public-uuid-prefix prefix))))
          (is (= [document-id] (map :id (public-sharing.db/unarchived-documents-by-public-uuid-prefix prefix)))))
        (testing "a prefix that looks like SQL is compared as a string, matching nothing"
          (let [hostile (str prefix "' OR '1'='1")]
            (is (empty? (public-sharing.db/unarchived-card-ids-and-public-uuids-by-prefix hostile)))
            (is (empty? (public-sharing.db/unarchived-cards-by-public-uuid-prefix hostile)))))))
    (mt/with-actions-enabled
      (let [uuid (str (random-uuid))]
        (mt/with-actions [{action-id :action-id} {:public_uuid uuid :made_public_by_id (mt/user->id :crowberto)}]
          (let [prefix (public-sharing/public-uuid-prefix uuid)]
            (is (= [action-id] (map :id (public-sharing.db/unarchived-action-ids-and-public-uuids-by-prefix prefix))))
            (is (= [action-id] (map :id (public-sharing.db/unarchived-actions-by-public-uuid-prefix prefix))))))))
    (testing "a non-string prefix is rejected before it reaches the query"
      (is (thrown? clojure.lang.ExceptionInfo
                   (public-sharing.db/unarchived-cards-by-public-uuid-prefix {:raw "(SELECT 1)"}))))))
