(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.api-test
  "Tests for /api/ee/transforms-python endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest get-library-path-test
  (testing "GET /api/ee/transforms-python/library/:path"
    (mt/with-premium-features #{:transforms-python :transforms}
      (testing "requires transform permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/transforms-python/library/common"))))
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (testing "returns nil when no library exists"
            (t2/delete! :model/PythonLibrary)
            (is (= "Not found." (mt/user-http-request :lucky :get 404 "ee/transforms-python/library/common"))))
          (testing "returns existing library"
            (t2/delete! :model/PythonLibrary)
            (python-library/update-python-library-source! "common" "def my_function():\n    return 42")
            (is (=? {:source "def my_function():\n    return 42"
                     :path "common.py"
                     :created_at some?
                     :updated_at some?}
                    (mt/user-http-request :lucky :get 200 "ee/transforms-python/library/common"))))
          (testing "rejects invalid paths"
            (is (= "Invalid library path. Only 'common' is currently supported."
                   (:message (mt/user-http-request :lucky :get 400 "ee/transforms-python/library/invalid-path"))))))))))

(deftest put-library-path-test
  (testing "PUT /api/ee/transforms-python/library/:path"
    (mt/with-premium-features #{:transforms-python :transforms}
      (testing "requires transform permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/transforms-python/library/common"
                                     {:source "def test(): pass"}))))
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (testing "validates request body"
            (testing "requires source field"
              (is (=? {:errors
                       {:source "string"}}
                      (mt/user-http-request :lucky :put 400 "ee/transforms-python/library/common"
                                            {}))))
            (testing "allows empty string"
              (t2/delete! :model/PythonLibrary)
              (is (=? {:source ""
                       :path "common.py"
                       :id integer?
                       :created_at some?
                       :updated_at some?}
                      (mt/user-http-request :lucky :put 200 "ee/transforms-python/library/common"
                                            {:source ""})))))
          (testing "creates new library when none exists"
            (t2/delete! :model/PythonLibrary)
            (is (=? {:source "def new_function():\n    return 100"
                     :path "common.py"
                     :id integer?
                     :created_at some?
                     :updated_at some?}
                    (mt/user-http-request :lucky :put 200 "ee/transforms-python/library/common"
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
                    (mt/user-http-request :lucky :put 200 "ee/transforms-python/library/common"
                                          {:source "def updated_function():\n    return 2"})))
            (is (= "def updated_function():\n    return 2"
                   (t2/select-one-fn :source :model/PythonLibrary)))
            (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate records"))
          (testing "rejects invalid paths"
            (is (= "Invalid library path. Only 'common' is currently supported."
                   (:message (mt/user-http-request :lucky :put 400 "ee/transforms-python/library/invalid-path"
                                                   {:source "def test(): pass"}))))))))))

(deftest test-run-test
  (mt/with-premium-features #{:transforms :transforms-python}
    (let [program ["import pandas as pd"
                   "import sys"
                   "def transform():"
                   "  print(\"out1\")"
                   "  print(\"err1\", file=sys.stderr)"
                   "  print(\"out2\")"
                   "  print(\"err2\", file=sys.stderr)"
                   "  return pd.DataFrame({'x': [42, 43]})"]
          body    {:source_tables {:test (t2/select-one-pk :model/Table :db_id (mt/id))}, :code (str/join "\n" program)}
          {:keys [error logs output]} (mt/user-http-request :crowberto :post 200 "ee/transforms-python/test-run" body)]
      (is (nil? error))
      (is (str/includes? logs "out1\nerr1\nout2\nerr2"))
      (is (=? {:cols [{:name "x"}] :rows [{:x 42} {:x 43}]} output)))))

(defn- test-run [& {:keys [program user features source-tables extra-opts]
                    :or   {program       ["import pandas as pd" "def transform():" "  return pd.DataFrame()"]
                           user          :crowberto
                           source-tables {:test (t2/select-one-pk :model/Table :db_id (mt/id))}
                           features      #{:transforms :transforms-python}}}]
  (let [body (merge {:source_tables source-tables, :code (str/join "\n" program)} extra-opts)]
    (mt/with-premium-features features
      (mt/user-http-request-full-response user :post "ee/transforms-python/test-run" body))))

(deftest test-run-with-inputs-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (mt/dataset transforms-dataset/transforms-test
      (let [program       ["def transform(customers):" "  return customers"]
            source-tables {"customers" (mt/id :transforms_customers)}
            {:keys [status body]} (test-run :program program :source-tables source-tables)]
        (is (= 200 status))
        (is (nil? (:error body)))
        (is (seq (:rows (:output body))))))))

(deftest test-run-empty-results-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (mt/dataset transforms-dataset/transforms-test
      (let [program       ["import pandas as pd" "def transform(customers):" "  return pd.DataFrame()"]
            source-tables {"customers" (mt/id :transforms_customers)}
            {:keys [status body]} (test-run :program program :source-tables source-tables)]
        (is (= 200 status))
        (is (nil? (:error body)))
        (is (empty? (:rows (:output body))))))))

(deftest test-run-error-test
  (let [program ["import pandas as pd" "def transform():" "  totallynotsourcecode"]
        {:keys [status body]} (test-run :program program)]
    (is (= 200 status))
    (is (=? {:message "Python execution failure (exit code 1)"} (:error body)))
    (is (str/includes? (:logs body "") "Traceback"))))

(deftest test-run-feature-test
  (is (=? {:status 402} (test-run :features #{})))
  (testing "transforms alone is not enough"
    (is (=? {:status 402} (test-run :features #{:transforms}))))
  (is (=? {:status 200} (test-run :features #{:transforms :transforms-python}))))

(deftest test-run-permissions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-group-for-user [lucky-group :lucky {:name "Lucky Transforms Group"}]
        (mt/with-db-perm-for-group! lucky-group (mt/id) :perms/transforms :yes
          (is (=? {:status 403} (test-run :user :rasta)))
          (is (=? {:status 200} (test-run :user :lucky))))))))

(deftest test-run-input-limit-test
  (testing "maximum"
    (is (=? {:status 400} (test-run :extra-opts {:per_input_row_limit 10000}))))
  (testing "minimum"
    (is (=? {:status 400} (test-run :extra-opts {:per_input_row_limit 0}))))
  (testing "truncates sources"
    (mt/dataset transforms-dataset/transforms-test
      (let [program       ["def transform(customers):" "  return customers"]
            source-tables {"customers" (mt/id :transforms_customers)}
            response      (test-run :program program :source-tables source-tables :extra-opts {:per_input_row_limit 2})]
        (is (=? {:body {:output {:rows #(= 2 (count %))}}} response))))))

(deftest test-run-output-limit-test
  (testing "maximum"
    (is (=? {:status 400} (test-run :extra-opts {:output_row_limit 10000}))))
  (testing "minimum"
    (is (=? {:status 400} (test-run :extra-opts {:output_row_limit 0}))))
  (testing "truncates outputs"
    (let [program       ["import pandas as pd" "def transform():" "  return pd.DataFrame({'x': [1,2,3,4]})"]
          response      (test-run :program program :extra-opts {:output_row_limit 2})]
      (is (=? {:body {:output {:rows #(= 2 (count %))}}} response)))))

(deftest test-run-timeout-test
  (let [program ["import pandas as pd"
                 "import time"
                 "def transform():"
                 "  time.sleep(30)"
                 "  return pd.DataFrame()"]]
    (mt/with-temporary-setting-values [python-runner-test-run-timeout-seconds 1]
      (let [response (test-run :program program)]
        (is (=? {:body {:error {:message "Python execution timed out"}}} response))))))

(deftest test-run-cols-meta-empty-return-test
  (let [program ["import pandas as pd"
                 "def transform():"
                 "  return pd.DataFrame(columns=['y', 'z', 'x'])"]
        response (test-run :program program)]
    (is (=? {:output {:cols [{:name "y"} {:name "z"} {:name "x"}]}} (:body response)))))
