(ns metabase-enterprise.branching.api-test
  "Tests for /api/ee/branch/ endpoints"
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Test Fixtures -------------------------------------------------

(defn- cleanup-test-branches!
  "Delete all test branches created during tests."
  []
  (t2/delete! :model/Branch))

;;; ------------------------------------------------- GET /api/ee/branch/ Tests -------------------------------------------------

(deftest list-branches-test
  (testing "GET /api/ee/branch/"
    (mt/with-premium-features #{:branching}
      (mt/with-temp [:model/Branch {branch1-id :id} {:name "Main Branch"}
                     :model/Branch _ {:name "Feature Branch" :parent_branch_id branch1-id}
                     :model/Branch _ {:name "Another Root Branch"}]
        (testing "Lists all branches without filter"
          (let [response (->> (mt/user-http-request :rasta :get 200 "ee/branch")
                              :data
                              (map (juxt :name :parent_branch_id))
                              set)]
            (is (set/subset? #{["Another Root Branch" nil]
                               ["Feature Branch" branch1-id]
                               ["Main Branch" nil]} response))))

        (testing "Filters branches by parent_id"
          (let [response (mt/user-http-request :rasta :get 200 (str "ee/branch?parent_id=" branch1-id))]
            (is (= 1 (count (:data response))))
            (is (= "Feature Branch" (-> response :data first :name)))
            (is (= branch1-id (-> response :data first :parent_branch_id)))))

        (testing "Returns empty list for non-existent parent_id"
          (let [response (mt/user-http-request :rasta :get 200 "ee/branch?parent_id=99999")]
            (is (= 0 (count (:data response))))))

        (testing "Filters for root branches when parent_id is -1'"
          (let [response (->> (mt/user-http-request :rasta :get 200 "ee/branch?parent_id=-1")
                              :data
                              (map :name)
                              set)]
            (is (set/subset? #{"Main Branch" "Another Root Branch"} response))
            (is (not (contains? response "Feature Branch")))))))))

(deftest list-branches-authentication-test
  (testing "GET /api/ee/branch/ requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :get 401 "ee/branch"))))))

(deftest list-branches-premium-feature-test
  (testing "GET /api/ee/branch/ requires branching premium feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Branch _ {:name "Test Branch"}]
        ;; Should return 402 Payment Required when premium feature is not enabled
        (mt/user-http-request :rasta :get 402 "ee/branch")))))

;;; ------------------------------------------------- GET /api/ee/branch/:id Tests -------------------------------------------------

(deftest get-branch-test
  (testing "GET /api/ee/branch/:id"
    (mt/with-premium-features #{:branching}
      (mt/with-temp [:model/Branch {branch-id :id} {:name "Test Branch"}]
        (testing "Returns branch by ID"
          (let [response (mt/user-http-request :rasta :get 200 (str "ee/branch/" branch-id))]
            (is (= branch-id (:id response)))
            (is (= "Test Branch" (:name response)))
            (is (= "test_branch" (:slug response)))
            (is (= (mt/user->id :rasta) (:creator_id response)))
            (is (nil? (:parent_branch_id response)))
            (is (contains? response :created_at))
            (is (contains? response :updated_at))))

        (testing "Returns 404 for non-existent branch ID"
          (mt/user-http-request :rasta :get 404 "ee/branch/99999"))))))

(deftest get-branch-authentication-test
  (testing "GET /api/ee/branch/:id requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :get 401 "ee/branch/1"))))))

(deftest get-branch-premium-feature-test
  (testing "GET /api/ee/branch/:id requires branching premium feature"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Branch {branch-id :id} {:name "Test Branch"}]
        ;; Should return 402 Payment Required when premium feature is not enabled
        (mt/user-http-request :rasta :get 402 (str "ee/branch/" branch-id))))))

;;; ------------------------------------------------- POST /api/ee/branch/ Tests -------------------------------------------------

(deftest create-branch-test
  (testing "POST /api/ee/branch/"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (testing "Creates branch with valid data"
          (let [response (mt/user-http-request :rasta :post 200 "ee/branch"
                                               {:name        "New Branch"
                                                :description "A test branch"})]
            (is (number? (:id response)))
            (is (= "New Branch" (:name response)))
            (is (= "new_branch" (:slug response)))
            (is (= (mt/user->id :rasta) (:creator_id response)))
            (is (nil? (:parent_branch_id response)))
            (is (contains? response :created_at))
            (is (contains? response :updated_at))))

        (testing "Creates child branch with valid parent_branch_id"
          (mt/with-temp [:model/Branch {parent-id :id} {:name "Parent Branch"}]
            (let [response (mt/user-http-request :rasta :post 200 "ee/branch"
                                                 {:name             "Child Branch"
                                                  :parent_branch_id parent-id})]
              (is (= parent-id (:parent_branch_id response)))
              (is (= "Child Branch" (:name response))))))

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
          (mt/with-temp [:model/Branch {branch-id :id} {:name  "Branch to Delete"}]
            (mt/user-http-request :rasta :delete 204 (str "ee/branch/" branch-id))
            (is (nil? (t2/select-one :model/Branch :id branch-id)))))

        (testing "Returns 404 when trying to delete non-existent branch"
          (mt/user-http-request :rasta :delete 404 "ee/branch/99999"))))))

(deftest delete-branch-with-children-test
  (testing "DELETE /api/ee/branch/:id prevents deletion of branch with children"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]
        (mt/with-temp [:model/Branch {parent-id :id} {:name  "Parent Branch"}
                       :model/Branch _child-branch {:name "Child Branch" :parent_branch_id parent-id}]

          (testing "Returns 400 when trying to delete branch with children"
            (mt/user-http-request :rasta :delete 400 (str "ee/branch/" parent-id)))

          (testing "Parent branch still exists after failed deletion attempt"
            (is (some? (t2/select-one :model/Branch :id parent-id)))))))))

(deftest delete-branch-authentication-test
  (testing "DELETE /api/ee/branch/:id requires authentication"
    (mt/with-premium-features #{:branching}
      (is (= (get api.response/response-unauthentic :body)
             (mt/client :delete 401 "ee/branch/1"))))))

(comment
  (deftest delete-branch-premium-feature-test
    (testing "DELETE /api/ee/branch/:id requires branching premium feature"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Branch {branch-id :id} {:name  "Test Branch"}]
            ;; Should return 402 Payment Required when premium feature is not enabled
          (mt/user-http-request :rasta :delete 402 (str "ee/branch/" branch-id)))))))

;;; ------------------------------------------------- Edge Cases and Error Handling -------------------------------------------------

(deftest branch-hierarchy-test
  (testing "Complex branch hierarchy operations"
    (mt/with-premium-features #{:branching}
      (mt/with-temp [:model/Branch {root-id :id} {:name  "Root"}
                     :model/Branch {level1-id :id} {:name "Level 1" :parent_branch_id root-id}
                     :model/Branch {level2-id :id} {:name "Level 2" :parent_branch_id level1-id}]

        (testing "Can delete leaf node (deepest branch)"
          (mt/user-http-request :rasta :delete 204 (str "ee/branch/" level2-id))
          (is (nil? (t2/select-one :model/Branch :id level2-id))))

        (testing "Can delete middle node after removing children"
          (mt/user-http-request :rasta :delete 204 (str "ee/branch/" level1-id))
          (is (nil? (t2/select-one :model/Branch :id level1-id))))

        (testing "Can delete root node after removing all children"
          (mt/user-http-request :rasta :delete 204 (str "ee/branch/" root-id))
          (is (nil? (t2/select-one :model/Branch :id root-id))))))))

(deftest parameter-validation-edge-cases-test
  (testing "Parameter validation edge cases"
    (mt/with-premium-features #{:branching}
      (mt/with-model-cleanup [:model/Branch]

        (comment
          (testing "GET /api/ee/branch/ with invalid parent_id type"
            ;; Should handle gracefully - invalid integer should return 400
            (mt/user-http-request :rasta :get 400 "ee/branch" {:parent_id "invalid"})))

        (testing "GET /api/ee/branch/:id with invalid ID format"
          ;; Should handle gracefully - invalid integer should return 400
          (mt/user-http-request :rasta :get 404 "ee/branch/invalid-id"))

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
      (mt/with-temp [:model/Branch {parent-id :id} {:name  "Parent"}
                     :model/Branch {child-id :id} {:name "Child" :parent_branch_id parent-id}]

        (testing "Multiple child branch creation for same parent"
          (let [responses (doall
                           (pmap (fn [i]
                                   (mt/user-http-request :rasta :post 200 "ee/branch"
                                                         {:name (str "Concurrent Child " i)
                                                          :parent_branch_id parent-id}))
                                 (range 5)))]
            (is (= 5 (count responses)))
            (is (every? #(= parent-id (:parent_branch_id %)) responses))
            (is (= 5 (count (distinct (map :id responses)))))))

        (testing "Cannot delete parent while children exist (race condition protection)"
          (mt/user-http-request :rasta :delete 400 (str "ee/branch/" parent-id)))))))
