(ns metabase.measures.api-test
  "Tests for /api/measure endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- legacy-mbql-measure-definition
  "Create an MBQL4 (legacy MBQL) full query measure definition.
  This format is used by Cypress e2e tests - the API accepts it and converts to MBQL5."
  [database-id table-id aggregation]
  {:database database-id
   :type     :query
   :query    {:source-table table-id
              :aggregation  aggregation}})

;; ## Helper Fns

(defn- pmbql-measure-definition
  "Create an MBQL5 measure definition with a sum aggregation."
  [table-id field-id]
  (let [metadata-provider (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id))
        table (lib.metadata/table metadata-provider table-id)
        query (lib/query metadata-provider table)
        field (lib.metadata/field metadata-provider field-id)]
    (lib/aggregate query (lib/sum field))))

;; ## /api/measure/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(deftest authentication-test
  (is (= (get api.response/response-unauthentic :body)
         (client/client :get 401 "measure")))

  (is (= (get api.response/response-unauthentic :body)
         (client/client :put 401 "measure/13"))))

;; ## POST /api/measure

(deftest create-measure-permissions-test
  (testing "POST /api/measure"
    (testing "Test security. Requires superuser perms."
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "measure" {:name       "abc"
                                                               :table_id   (mt/id :venues)
                                                               :definition {}}))))))

(deftest create-measure-input-validation-test
  (testing "POST /api/measure"
    (is (=? {:errors {:name "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :post 400 "measure" {})))

    (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
            (mt/user-http-request :crowberto :post 400 "measure" {:name "abc"})))

    (is (=? {:errors {:table_id "value must be an integer greater than zero."}}
            (mt/user-http-request :crowberto :post 400 "measure" {:name     "abc"
                                                                  :table_id "foobar"})))

    (is (=? {:errors {:definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "measure" {:name     "abc"
                                                                  :table_id 123})))

    (is (=? {:errors {:definition "Value must be a map."}}
            (mt/user-http-request :crowberto :post 400 "measure" {:name       "abc"
                                                                  :table_id   123
                                                                  :definition "foobar"})))))

(deftest create-measure-test
  (testing "POST /api/measure"
    (is (=? {:name        "A Measure"
             :description "I did it!"
             :creator_id  (mt/user->id :crowberto)
             :creator     {:id (mt/user->id :crowberto)}
             :entity_id   string?
             :created_at  some?
             :updated_at  some?
             :archived    false
             :definition  map?}
            (mt/user-http-request :crowberto :post 200 "measure"
                                  {:name        "A Measure"
                                   :description "I did it!"
                                   :table_id    (mt/id :venues)
                                   :definition  (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))})))))

;; ## PUT /api/measure

(deftest update-permissions-test
  (testing "PUT /api/measure/:id"
    (testing "test security. requires superuser perms"
      (mt/with-temp [:model/Measure measure {:table_id   (mt/id :venues)
                                             :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "measure/" (:id measure))
                                     {:name             "abc"
                                      :definition       {}
                                      :revision_message "something different"})))))))

(deftest update-input-validation-test
  (testing "PUT /api/measure/:id"
    (is (=? {:errors {:name "nullable value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "measure/1" {:name "" :revision_message "abc"})))

    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "measure/1" {:name "abc"})))

    (is (=? {:errors {:revision_message "value must be a non-blank string."}}
            (mt/user-http-request :crowberto :put 400 "measure/1" {:name             "abc"
                                                                   :revision_message ""})))

    (is (=? {:errors {:definition "nullable map"}}
            (mt/user-http-request :crowberto :put 400 "measure/1" {:name             "abc"
                                                                   :revision_message "123"
                                                                   :definition       "foobar"})))))

(deftest update-test
  (testing "PUT /api/measure/:id"
    (mt/with-temp [:model/Measure {:keys [id]} {:table_id   (mt/id :venues)
                                                :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (is (=? {:name        "Updated Measure"
               :description nil
               :creator_id  (mt/user->id :rasta)
               :creator     {:id (mt/user->id :rasta)}
               :entity_id   string?
               :created_at  some?
               :updated_at  some?
               :archived    false
               :definition  map?}
              (mt/user-http-request
               :crowberto :put 200 (format "measure/%d" id)
               {:id               id
                :name             "Updated Measure"
                :description      nil
                :table_id         (mt/id :venues)
                :revision_message "I got me some revisions"
                :definition       (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}))))))

(deftest partial-update-test
  (testing "PUT /api/measure/:id"
    (testing "Can I update a measure's name without specifying all fields?"
      (mt/with-temp [:model/Measure measure {:table_id   (mt/id :venues)
                                             :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
        ;; just make sure API call doesn't barf
        (is (some? (mt/user-http-request :crowberto :put 200 (str "measure/" (u/the-id measure))
                                         {:name             "Cool name"
                                          :revision_message "WOW HOW COOL"})))))))

(deftest archive-test
  (testing "PUT /api/measure/:id"
    (testing "Can we archive a Measure with the PUT endpoint?"
      (mt/with-temp [:model/Measure {:keys [id]} {:table_id   (mt/id :venues)
                                                  :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "measure/" id)
                                        {:archived true, :revision_message "Archive the Measure"})))
        (is (true?
             (t2/select-one-fn :archived :model/Measure :id id)))))))

(deftest unarchive-test
  (testing "PUT /api/measure/:id"
    (testing "Can we unarchive a Measure with the PUT endpoint?"
      (mt/with-temp [:model/Measure {:keys [id]} {:archived   true
                                                  :table_id   (mt/id :venues)
                                                  :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
        (is (map? (mt/user-http-request :crowberto :put 200 (str "measure/" id)
                                        {:archived false, :revision_message "Unarchive the Measure"})))
        (is (= false
               (t2/select-one-fn :archived :model/Measure :id id)))))))

;; ## GET /api/measure/:id

(deftest fetch-measure-permissions-test
  (testing "GET /api/measure/:id"
    (testing "test security. Requires manage-table-metadata perms for the Table it references"
      (mt/with-temp [:model/Measure measure {:table_id   (mt/id :venues)
                                             :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
        (mt/with-no-data-perms-for-all-users!
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "measure/" (u/the-id measure))))))))))

(deftest fetch-measure-test
  (testing "GET /api/measure/:id"
    (mt/with-temp [:model/Measure {:keys [id]} {:creator_id (mt/user->id :crowberto)
                                                :table_id   (mt/id :venues)
                                                :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (mt/with-full-data-perms-for-all-users!
        (is (=? {:name        "Mock Measure"
                 :description nil
                 :creator_id  (mt/user->id :crowberto)
                 :creator     {:id (mt/user->id :crowberto)}
                 :created_at  some?
                 :updated_at  some?
                 :entity_id   string?
                 :archived    false
                 :definition  map?}
                (mt/user-http-request :rasta :get 200 (format "measure/%d" id))))))))

(deftest fetch-measure-saves-dimensions-on-read-test
  (testing "GET /api/measure/:id saves dimensions and dimension_mappings to the database"
    (mt/with-temp [:model/Measure {:keys [id]} {:creator_id (mt/user->id :crowberto)
                                                :table_id   (mt/id :venues)
                                                :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (testing "no dimensions saved initially"
        (let [initial-measure (t2/select-one :model/Measure :id id)]
          (is (nil? (:dimensions initial-measure)))
          (is (nil? (:dimension_mappings initial-measure)))))
      (testing "response contains dimensions with active status"
        (mt/with-full-data-perms-for-all-users!
          (let [response (mt/user-http-request :rasta :get 200 (format "measure/%d" id))]
            (is (seq (:dimensions response)))
            (is (seq (:dimension_mappings response)))
            (is (every? #(= "status/active" (:status %)) (:dimensions response))))))
      (testing "dimensions persisted to database"
        (let [updated-measure (t2/select-one :model/Measure :id id)]
          (is (seq (:dimensions updated-measure)))
          (is (seq (:dimension_mappings updated-measure))))))))

(deftest list-test
  (testing "GET /api/measure/"
    (mt/with-temp [:model/Measure {id-1 :id} {:name       "Measure 1"
                                              :table_id   (mt/id :venues)
                                              :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}
                   :model/Measure {id-2 :id} {:name       "Measure 2"
                                              :table_id   (mt/id :products)
                                              :definition (pmbql-measure-definition (mt/id :products) (mt/id :products :price))}
                   ;; archived measures shouldn't show up
                   :model/Measure {id-3 :id} {:archived   true
                                              :table_id   (mt/id :venues)
                                              :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (mt/with-full-data-perms-for-all-users!
        (is (=? [{:id                     id-1
                  :name                   "Measure 1"
                  :creator                {}
                  :definition_description string?}
                 {:id                     id-2
                  :name                   "Measure 2"
                  :definition             {}
                  :creator                {}
                  :definition_description string?}]
                (filter (fn [{measure-id :id}]
                          (contains? #{id-1 id-2 id-3} measure-id))
                        (mt/user-http-request :rasta :get 200 "measure/"))))))))

;;; ------------------------------------------------ MBQL4 API Support Tests ------------------------------------------------
;;; The API layer accepts MBQL4 definitions (for Cypress e2e test support) and converts them to MBQL5.
;;; TODO (Tamas 2026-01-09): Remove these tests once FE tests switch to using MBQL5.

(defn- mbql4-fragment-definition
  "Create an MBQL4 fragment definition (no :database or :type keys)."
  [table-id aggregation]
  {:source-table table-id
   :aggregation  aggregation})

(defn- mbql5-definition?
  "Check if a definition is in MBQL5 format (has :lib/type key)."
  [definition]
  (contains? definition :lib/type))

(deftest api-accepts-mbql4-on-post-test
  (testing "POST /api/measure accepts MBQL4 definitions and returns MBQL5"
    (mt/with-model-cleanup [:model/Measure]
      (testing "MBQL4 fragment format"
        (let [response (mt/user-http-request
                        :crowberto :post 200 "measure"
                        {:name       "Fragment Measure"
                         :table_id   (mt/id :venues)
                         :definition (mbql4-fragment-definition (mt/id :venues) [[:count]])})]
          (is (some? (:id response)))
          (is (mbql5-definition? (:definition response))
              "Returned definition should be MBQL5")))
      (testing "MBQL4 full query format"
        (let [response (mt/user-http-request
                        :crowberto :post 200 "measure"
                        {:name       "Full Query Measure"
                         :table_id   (mt/id :venues)
                         :definition (legacy-mbql-measure-definition (mt/id) (mt/id :venues) [[:count]])})]
          (is (some? (:id response)))
          (is (mbql5-definition? (:definition response))
              "Returned definition should be MBQL5"))))))

(deftest api-accepts-mbql4-on-put-test
  (testing "PUT /api/measure/:id accepts MBQL4 definitions and returns MBQL5"
    (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                    :definition (pmbql-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (testing "MBQL4 fragment format"
        (let [response (mt/user-http-request
                        :crowberto :put 200 (str "measure/" measure-id)
                        {:revision_message "Update with fragment"
                         :definition       (mbql4-fragment-definition (mt/id :venues) [[:count]])})]
          (is (= measure-id (:id response)))
          (is (mbql5-definition? (:definition response))
              "Returned definition should be MBQL5")))
      (testing "MBQL4 full query format"
        (let [response (mt/user-http-request
                        :crowberto :put 200 (str "measure/" measure-id)
                        {:revision_message "Update with full query"
                         :definition       (legacy-mbql-measure-definition (mt/id) (mt/id :venues) [[:sum [:field (mt/id :venues :price) nil]]])})]
          (is (= measure-id (:id response)))
          (is (mbql5-definition? (:definition response))
              "Returned definition should be MBQL5"))))))

(deftest api-mbql4-measure-is-executable-test
  (testing "Measures created via API with MBQL4 can be used in queries"
    (mt/with-model-cleanup [:model/Measure]
      (let [{measure-id :id} (mt/user-http-request
                              :crowberto :post 200 "measure"
                              {:name       "Venue Count"
                               :table_id   (mt/id :venues)
                               :definition (mbql4-fragment-definition (mt/id :venues) [[:count]])})
            ;; Query using the measure
            measure-query {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :venues)
                                      :aggregation  [[:measure measure-id]]}}
            ;; Equivalent direct query
            direct-query  {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :venues)
                                      :aggregation  [[:count]]}}]
        (is (= (mt/rows (qp/process-query direct-query))
               (mt/rows (qp/process-query measure-query))))))))
