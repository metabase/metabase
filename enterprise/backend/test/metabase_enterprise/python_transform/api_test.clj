(ns metabase-enterprise.python-transform.api-test
  "Tests for /api/ee/python-transform endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.python-transform.models.python-library :as python-library]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest get-user-modules-code-test
  (testing "GET /api/ee/python-transform/user-modules/code"
    (mt/with-premium-features #{:transforms}
      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/python-transform/user-modules/code"))))

      (testing "returns nil when no library exists"
        (t2/delete! :model/PythonLibrary)
        (is (nil? (mt/user-http-request :crowberto :get 204 "ee/python-transform/user-modules/code"))))

      (testing "returns existing library"
        (t2/delete! :model/PythonLibrary)
        (python-library/update-python-library-source! "def my_function():\n    return 42")
        (is (=? {:source "def my_function():\n    return 42"}
                (mt/user-http-request :crowberto :get 200 "ee/python-transform/user-modules/code")))))))

(deftest put-user-modules-code-test
  (testing "PUT /api/ee/python-transform/user-modules/code"
    (mt/with-premium-features #{:transforms}
      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/python-transform/user-modules/code"
                                     {:source "def test(): pass"}))))

      (testing "validates request body"
        (testing "requires source field"
          (is (=? {:errors
                   {:source "string with length >= 0"}}
                  (mt/user-http-request :crowberto :put 400 "ee/python-transform/user-modules/code"
                                        {}))))

        (testing "allows empty string"
          (t2/delete! :model/PythonLibrary)
          (let [response (mt/user-http-request :crowberto :put 200 "ee/python-transform/user-modules/code"
                                               {:source ""})]
            (is (= "" (:source response)))
            (is (contains? response :id)))))

      (testing "creates new library when none exists"
        (t2/delete! :model/PythonLibrary)
        (let [response (mt/user-http-request :crowberto :put 200 "ee/python-transform/user-modules/code"
                                             {:source "def new_function():\n    return 100"})]
          (is (= "def new_function():\n    return 100" (:source response)))
          (is (contains? response :id))
          (is (contains? response :created_at))
          (is (contains? response :updated_at)))
        (is (= "def new_function():\n    return 100"
               (t2/select-one-fn :source :model/PythonLibrary))))

      (testing "updates existing library"
        (t2/delete! :model/PythonLibrary)
        (python-library/update-python-library-source! "def old_function():\n    return 1")
        (let [response (mt/user-http-request :crowberto :put 200 "ee/python-transform/user-modules/code"
                                             {:source "def updated_function():\n    return 2"})]
          (is (= "def updated_function():\n    return 2" (:source response)))
          (is (contains? response :id))
          (is (contains? response :created_at))
          (is (contains? response :updated_at)))
        (is (= "def updated_function():\n    return 2"
               (t2/select-one-fn :source :model/PythonLibrary)))
        (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate records")))))
