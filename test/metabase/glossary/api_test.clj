(ns metabase.glossary.api-test
  "Tests for /api/glossary endpoints."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest glossary-api-test
  (mt/with-model-cleanup [:model/Glossary]
    (testing "POST /api/glossary"
      (testing "can create a new glossary entry as superuser"
        (let [response (mt/user-http-request :crowberto :post 200 "glossary"
                                             {:term "API"
                                              :definition "Application Programming Interface"})
              crowberto-id (mt/user->id :crowberto)
              glossary-id (:id response)
              creator-id (t2/select-one-fn :creator_id :model/Glossary glossary-id)]
          (is (= "API" (:term response)))
          (is (= "Application Programming Interface" (:definition response)))
          (is (pos-int? (:id response)))
          (testing "Response includes creator_id"
            (is (= crowberto-id (:creator_id response))))
          (testing "Database record has creator_id set correctly"
            (is (= crowberto-id creator-id)))
          (testing "Response hydrates creator"
            (is (map? (:creator response)))
            (is (= crowberto-id (get-in response [:creator :id]))))))

      (testing "cannot create glossary entry with missing fields"
        (is (=? {:errors {:term "value must be a non-blank string."}}
                (mt/user-http-request :crowberto :post 400 "glossary"
                                      {:definition "Missing term field"})))
        (is (=? {:errors {:definition "value must be a non-blank string."}}
                (mt/user-http-request :crowberto :post 400 "glossary"
                                      {:term "Missing definition field"}))))))

  (testing "GET /api/glossary"
    (let [crowberto-id (mt/user->id :crowberto)]
      (mt/with-temp [:model/Glossary _g1 {:term "Database"
                                          :definition "A structured collection of data"
                                          :creator_id crowberto-id}
                     :model/Glossary _g2 {:term "Query"
                                          :definition "A request for data from a database"
                                          :creator_id crowberto-id}]
        (testing "can list all glossary entries"
          (let [response (mt/user-http-request :rasta :get 200 "glossary")
                data     (:data response)]
            (is (<= 2 (count data)))
            (is (set/subset? #{"Database" "Query"} (set (map :term data))))
            (testing "Response hydrates creator"
              (is (every? #(map? (:creator %)) data)))))

        (testing "can search glossary entries by term"
          (let [response (mt/user-http-request :rasta :get 200 "glossary" :search "data")
                data     (:data response)]
            (is (= 2 (count data)))
            (is (every? #(or (re-find #"(?i)data" (:term %))
                             (re-find #"(?i)data" (:definition %))) data))))

        (testing "search is case insensitive"
          (let [response (mt/user-http-request :rasta :get 200 "glossary" :search "DATABASE")
                data     (:data response)]
            (is (<= 1 (count data)))
            (is (set/subset? #{"Database"} (set (map :term data))))))

        (testing "search returns empty when no matches"
          (let [response (mt/user-http-request :rasta :get 200 "glossary" :search (str "nonexistent-" (random-uuid)))
                data     (:data response)]
            (is (= 0 (count data))))))))

  (testing "PUT /api/glossary/:id"
    (let [crowberto-id (mt/user->id :crowberto)]
      (mt/with-temp [:model/Glossary {gid :id} {:term "Old Term"
                                                :definition "Old definition"
                                                :creator_id crowberto-id}]
        (testing "can update glossary entry as superuser"
          (let [response (mt/user-http-request :crowberto :put 200 (str "glossary/" gid)
                                               {:term       "Updated Term"
                                                :definition "Updated definition"})]
            (is (= "Updated Term" (:term response)))
            (is (= "Updated definition" (:definition response)))
            (is (= gid (:id response)))
            (testing "Response hydrates creator"
              (is (map? (:creator response)))
              (is (= crowberto-id (get-in response [:creator :id]))))))

        (testing "returns 404 when updating non-existent entry"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404 "glossary/99999"
                                       {:term       "Does not exist"
                                        :definition "Does not exist"})))))))

  (testing "DELETE /api/glossary/:id"
    (mt/with-temp [:model/Glossary {gid :id} {:term "To Delete" :definition "Will be deleted"}]
      (testing "can delete glossary entry as superuser"
        (is (= nil
               (mt/user-http-request :crowberto :delete 204 (str "glossary/" gid))))
        (is (nil? (t2/select-one :model/Glossary :id gid))))

      (testing "returns 404 when deleting non-existent entry"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404 "glossary/99999")))))))
