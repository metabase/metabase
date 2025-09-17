(ns metabase-enterprise.transforms-python.api-test
  "Tests for /api/ee/transforms-python endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest get-library-path-test
  (testing "GET /api/ee/transforms-python/library/:path"
    (mt/with-premium-features #{:transforms-python}
      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/transforms-python/library/common"))))

      (testing "returns nil when no library exists"
        (t2/delete! :model/PythonLibrary)
        (is (= "Not found." (mt/user-http-request :crowberto :get 404 "ee/transforms-python/library/common"))))

      (testing "returns existing library"
        (t2/delete! :model/PythonLibrary)
        (python-library/update-python-library-source! "common" "def my_function():\n    return 42")
        (is (=? {:source "def my_function():\n    return 42"
                 :path "common.py"
                 :created_at some?
                 :updated_at some?}
                (mt/user-http-request :crowberto :get 200 "ee/transforms-python/library/common"))))

      (testing "rejects invalid paths"
        (is (= "Invalid library path. Only 'common' is currently supported."
               (:message (mt/user-http-request :crowberto :get 400 "ee/transforms-python/library/invalid-path"))))))))

(deftest put-library-path-test
  (testing "PUT /api/ee/transforms-python/library/:path"
    (mt/with-premium-features #{:transforms-python}
      (testing "requires superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/transforms-python/library/common"
                                     {:source "def test(): pass"}))))

      (testing "validates request body"
        (testing "requires source field"
          (is (=? {:errors
                   {:source "string"}}
                  (mt/user-http-request :crowberto :put 400 "ee/transforms-python/library/common"
                                        {}))))

        (testing "allows empty string"
          (t2/delete! :model/PythonLibrary)
          (is (=? {:source ""
                   :path "common.py"
                   :id integer?
                   :created_at some?
                   :updated_at some?}
                  (mt/user-http-request :crowberto :put 200 "ee/transforms-python/library/common"
                                        {:source ""})))))

      (testing "creates new library when none exists"
        (t2/delete! :model/PythonLibrary)
        (is (=? {:source "def new_function():\n    return 100"
                 :path "common.py"
                 :id integer?
                 :created_at some?
                 :updated_at some?}
                (mt/user-http-request :crowberto :put 200 "ee/transforms-python/library/common"
                                      {:source "def new_function():\n    return 100"})))
        (is (= "def new_function():\n    return 100"
               (t2/select-one-fn :source :model/PythonLibrary))))

      (testing "updates existing library"
        (t2/delete! :model/PythonLibrary)
        (python-library/update-python-library-source! "common" "def old_function():\n    return 1")
        (is (=? {:source "def updated_function():\n    return 2"
                 :path "common.py"
                 :id integer?
                 :created_at some?
                 :updated_at some?}
                (mt/user-http-request :crowberto :put 200 "ee/transforms-python/library/common"
                                      {:source "def updated_function():\n    return 2"})))
        (is (= "def updated_function():\n    return 2"
               (t2/select-one-fn :source :model/PythonLibrary)))
        (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate records"))

      (testing "rejects invalid paths"
        (is (= "Invalid library path. Only 'common' is currently supported."
               (:message (mt/user-http-request :crowberto :put 400 "ee/transforms-python/library/invalid-path"
                                               {:source "def test(): pass"}))))))))
