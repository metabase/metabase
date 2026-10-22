(ns metabase.public-sharing.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.public-sharing.db :as public-sharing.db]
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

(deftest prefix-lookups-bind-the-prefix-without-the-schema-test
  (testing "GHY-4587: with the schema off, the marker rejects an operator-shaped prefix instead of compiling it into the WHERE"
    ;; An unmarked `[:not= "x"]` in the kv-arg slot compiles to `public_uuid_prefix <> 'x'` and matches every shared row.
    (mt/with-temp [:model/Card      _ {:public_uuid (str (random-uuid))}
                   :model/Dashboard _ {:public_uuid (str (random-uuid))}
                   :model/Document  _ {:name "Shared Doc" :public_uuid (str (random-uuid))}]
      (mu/disable-enforcement
        (doseq [lookup [public-sharing.db/unarchived-card-ids-and-public-uuids-by-prefix
                        public-sharing.db/unarchived-dashboard-ids-and-public-uuids-by-prefix
                        public-sharing.db/unarchived-action-ids-and-public-uuids-by-prefix
                        public-sharing.db/unarchived-document-ids-and-public-uuids-by-prefix
                        public-sharing.db/unarchived-cards-by-public-uuid-prefix
                        public-sharing.db/unarchived-dashboards-by-public-uuid-prefix
                        public-sharing.db/unarchived-actions-by-public-uuid-prefix
                        public-sharing.db/unarchived-documents-by-public-uuid-prefix]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                (doall (lookup [:not= "zzzzzzzz"])))))))))
