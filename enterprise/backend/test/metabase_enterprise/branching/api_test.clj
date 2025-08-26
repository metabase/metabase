(ns metabase-enterprise.branching.api-test
  "Tests for /api/ee/branch/ endpoints"
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Test Fixtures -------------------------------------------------

(defn- create-test-branch!
  "Create a test branch with optional parent."
  ([name] (create-test-branch! name nil))
  ([name parent-id]
   (let [branch-data (cond-> {:name name
                              :creator_id (mt/user->id :rasta)}
                       parent-id (assoc :parent_branch_id parent-id))]
     (t2/insert-returning-instance! :model/Branch branch-data))))

(defn- cleanup-test-branches!
  "Delete all test branches created during tests."
  []
  (t2/delete! :model/Branch))

;;; ------------------------------------------------- GET /api/ee/branch/ Tests -------------------------------------------------

(deftest list-branches-test
  (testing "GET /api/ee/branch/"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (let [branch1 (create-test-branch! "Main Branch")
              branch2 (create-test-branch! "Feature Branch" (:id branch1))
              branch3 (create-test-branch! "Another Root Branch")]

          (testing "Lists all branches without filter"
            (let [response (mt/user-http-request :rasta :get 200 "ee/branch")]
              (is (= 3 (count (:data response))))
              (is (set/subset? #{"Main Branch" "Feature Branch" "Another Root Branch"}
                               (set (map :name (:data response)))))))

          (testing "Filters branches by parent_id"
            (let [response (mt/user-http-request :rasta :get 200 "ee/branch"
                                                 {:parent_id (:id branch1)})]
              (is (= 1 (count (:data response))))
              (is (= "Feature Branch" (-> response :data first :name)))
              (is (= (:id branch1) (-> response :data first :parent_branch_id)))))

          (testing "Returns empty list for non-existent parent_id"
            (let [response (mt/user-http-request :rasta :get 200 "ee/branch"
                                                 {:parent_id 99999})]
              (is (= 0 (count (:data response))))))

          (testing "Filters for root branches when parent_id is null"
            (let [response (mt/user-http-request :rasta :get 200 "ee/branch"
                                                 {:parent_id nil})]
              (is (= 2 (count (:data response))))
              (is (set/subset? #{"Main Branch" "Another Root Branch"}
                               (set (map :name (:data response))))))))))))

(deftest list-branches-authentication-test
  (testing "GET /api/ee/branch/ requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :get 401 "ee/branch"))))))

(deftest list-branches-premium-feature-test
  (testing "GET /api/ee/branch/ requires branching premium feature"
    (mt/with-premium-features #{}
      (mt/with-model-cleanup [:model/Branch]
        (create-test-branch! "Test Branch")
        ;; Should return 402 Payment Required when premium feature is not enabled
        (mt/user-http-request :rasta :get 402 "ee/branch")))))

;;; ------------------------------------------------- GET /api/ee/branch/:id Tests -------------------------------------------------

(deftest get-branch-test
  (testing "GET /api/ee/branch/:id"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (let [branch (create-test-branch! "Test Branch")]

          (testing "Returns branch by ID"
            (let [response (mt/user-http-request :rasta :get 200 (str "ee/branch/" (:id branch)))]
              (is (= (:id branch) (:id response)))
              (is (= "Test Branch" (:name response)))
              (is (= "test-branch" (:slug response)))
              (is (= (mt/user->id :rasta) (:creator_id response)))
              (is (nil? (:parent_branch_id response)))
              (is (contains? response :created_at))
              (is (contains? response :updated_at))))

          (testing "Returns 404 for non-existent branch ID"
            (mt/user-http-request :rasta :get 404 "ee/branch/99999")))))))

(deftest get-branch-authentication-test
  (testing "GET /api/ee/branch/:id requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :get 401 "ee/branch/1"))))))

(deftest get-branch-premium-feature-test
  (testing "GET /api/ee/branch/:id requires branching premium feature"
    (mt/with-premium-features #{}
      (mt/with-model-cleanup [:model/Branch]
        (let [branch (create-test-branch! "Test Branch")]
          ;; Should return 402 Payment Required when premium feature is not enabled
          (mt/user-http-request :rasta :get 402 (str "ee/branch/" (:id branch))))))))

;;; ------------------------------------------------- POST /api/ee/branch/ Tests -------------------------------------------------

(deftest create-branch-test
  (testing "POST /api/ee/branch/"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (testing "Creates branch with valid data"
          (let [response (mt/user-http-request :rasta :post 200 "ee/branch"
                                               {:name "New Branch"
                                                :description "A test branch"})]
            (is (number? (:id response)))
            (is (= "New Branch" (:name response)))
            (is (= "new-branch" (:slug response)))
            (is (= "A test branch" (:description response)))
            (is (= (mt/user->id :rasta) (:creator_id response)))
            (is (nil? (:parent_branch_id response)))
            (is (contains? response :created_at))
            (is (contains? response :updated_at))))

        (testing "Creates child branch with valid parent_branch_id"
          (let [parent-branch (create-test-branch! "Parent Branch")
                response (mt/user-http-request :rasta :post 200 "ee/branch"
                                               {:name "Child Branch"
                                                :parent_branch_id (:id parent-branch)})]
            (is (= (:id parent-branch) (:parent_branch_id response)))
            (is (= "Child Branch" (:name response)))))

        (testing "Creates branch without description (optional field)"
          (let [response (mt/user-http-request :rasta :post 200 "ee/branch"
                                               {:name "Minimal Branch"})]
            (is (= "Minimal Branch" (:name response)))
            (is (nil? (:description response)))))))))

(deftest create-branch-validation-test
  (testing "POST /api/ee/branch/ input validation"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (testing "Rejects request with missing name"
          (mt/user-http-request :rasta :post 400 "ee/branch" {}))

        (testing "Rejects request with blank name"
          (mt/user-http-request :rasta :post 400 "ee/branch" {:name ""}))

        (testing "Rejects request with invalid parent_branch_id"
          (mt/user-http-request :rasta :post 400 "ee/branch"
                                {:name "Invalid Parent Branch"
                                 :parent_branch_id 99999}))

        (testing "Rejects request with non-integer parent_branch_id"
          (mt/user-http-request :rasta :post 400 "ee/branch"
                                {:name "Invalid Parent Type"
                                 :parent_branch_id "not-a-number"}))))))

(deftest create-branch-authentication-test
  (testing "POST /api/ee/branch/ requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :post 401 "ee/branch" {:name "Test Branch"}))))))

(deftest create-branch-premium-feature-test
  (testing "POST /api/ee/branch/ requires branching premium feature"
    (mt/with-premium-features #{}
      ;; Should return 402 Payment Required when premium feature is not enabled
      (mt/user-http-request :rasta :post 402 "ee/branch" {:name "Test Branch"}))))

;;; ------------------------------------------------- DELETE /api/ee/branch/:id Tests -------------------------------------------------

(deftest delete-branch-test
  (testing "DELETE /api/ee/branch/:id"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (testing "Deletes branch without children"
          (let [branch (create-test-branch! "Branch to Delete")]
            (mt/user-http-request :rasta :delete 204 (str "ee/branch/" (:id branch)))
            (is (nil? (t2/select-one :model/Branch :id (:id branch))))))

        (testing "Returns 404 when trying to delete non-existent branch"
          (mt/user-http-request :rasta :delete 404 "ee/branch/99999"))))))

(deftest delete-branch-with-children-test
  (testing "DELETE /api/ee/branch/:id prevents deletion of branch with children"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (let [parent-branch (create-test-branch! "Parent Branch")
              _child-branch (create-test-branch! "Child Branch" (:id parent-branch))]

          (testing "Returns 400 when trying to delete branch with children"
            (mt/user-http-request :rasta :delete 400 (str "ee/branch/" (:id parent-branch))))

          (testing "Parent branch still exists after failed deletion attempt"
            (is (some? (t2/select-one :model/Branch :id (:id parent-branch))))))))))

(deftest delete-branch-authentication-test
  (testing "DELETE /api/ee/branch/:id requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :delete 401 "ee/branch/1"))))))

(deftest delete-branch-premium-feature-test
  (testing "DELETE /api/ee/branch/:id requires branching premium feature"
    (mt/with-premium-features #{}
      (mt/with-model-cleanup [:model/Branch]
        (let [branch (create-test-branch! "Test Branch")]
          ;; Should return 402 Payment Required when premium feature is not enabled
          (mt/user-http-request :rasta :delete 402 (str "ee/branch/" (:id branch))))))))

;;; ------------------------------------------------- Edge Cases and Error Handling -------------------------------------------------

(deftest branch-hierarchy-test
  (testing "Complex branch hierarchy operations"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (let [root-branch (create-test-branch! "Root")
              level1-branch (create-test-branch! "Level 1" (:id root-branch))
              level2-branch (create-test-branch! "Level 2" (:id level1-branch))]

          (testing "Can delete leaf node (deepest branch)"
            (mt/user-http-request :rasta :delete 204 (str "ee/branch/" (:id level2-branch)))
            (is (nil? (t2/select-one :model/Branch :id (:id level2-branch)))))

          (testing "Can delete middle node after removing children"
            (mt/user-http-request :rasta :delete 204 (str "ee/branch/" (:id level1-branch)))
            (is (nil? (t2/select-one :model/Branch :id (:id level1-branch)))))

          (testing "Can delete root node after removing all children"
            (mt/user-http-request :rasta :delete 204 (str "ee/branch/" (:id root-branch)))
            (is (nil? (t2/select-one :model/Branch :id (:id root-branch))))))))))

(deftest parameter-validation-edge-cases-test
  (testing "Parameter validation edge cases"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (testing "GET /api/ee/branch/ with invalid parent_id type"
          ;; Should handle gracefully - invalid integer should return 400
          (mt/user-http-request :rasta :get 400 "ee/branch" {:parent_id "invalid"}))

        (testing "GET /api/ee/branch/:id with invalid ID format"
          ;; Should handle gracefully - invalid integer should return 400
          (mt/user-http-request :rasta :get 400 "ee/branch/invalid-id"))

        (testing "POST /api/ee/branch/ with extra unexpected fields"
          ;; Should ignore extra fields and create branch successfully
          (let [response (mt/user-http-request :rasta :post 200 "ee/branch"
                                               {:name "Test Branch"
                                                :unexpected_field "should be ignored"})]
            (is (= "Test Branch" (:name response)))
            (is (not (contains? response :unexpected_field)))))))))

(deftest concurrent-operations-test
  (testing "Concurrent branch operations"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (let [parent-branch (create-test-branch! "Parent")
              child-branch (create-test-branch! "Child" (:id parent-branch))]

          (testing "Multiple child branch creation for same parent"
            (let [responses (doall
                             (pmap (fn [i]
                                     (mt/user-http-request :rasta :post 200 "ee/branch"
                                                           {:name (str "Concurrent Child " i)
                                                            :parent_branch_id (:id parent-branch)}))
                                   (range 5)))]
              (is (= 5 (count responses)))
              (is (every? #(= (:id parent-branch) (:parent_branch_id %)) responses))
              (is (= 5 (count (distinct (map :id responses)))))))

          (testing "Cannot delete parent while children exist (race condition protection)"
            (mt/user-http-request :rasta :delete 400 (str "ee/branch/" (:id parent-branch)))))))))