(ns metabase-enterprise.python-transform.models.python-library-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.python-transform.models.python-library :as python-library]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-python-library-source-test
  (testing "update-python-library-source!"
    (testing "creates new record when none exists"
      (t2/delete! :model/PythonLibrary)
      (let [library (python-library/update-python-library-source! "def new_func(): return 1")]
        (is (= "def new_func(): return 1" (:source library)))
        (is (contains? library :id))
        (is (contains? library :created_at))
        (is (contains? library :updated_at)))
      (is (= 1 (t2/count :model/PythonLibrary)))
      (is (= "def new_func(): return 1"
             (t2/select-one-fn :source :model/PythonLibrary))))

    (testing "updates existing record"
      (is (= 1 (t2/count :model/PythonLibrary)))
      (let [library (python-library/update-python-library-source! "def updated_func(): return 2")]
        (is (= "def updated_func(): return 2" (:source library)))
        (is (contains? library :id))
        (is (contains? library :created_at))
        (is (contains? library :updated_at)))
      (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate")
      (is (= "def updated_func(): return 2"
             (t2/select-one-fn :source :model/PythonLibrary))))))

(deftest can-have-only-one-python-library-test
  (testing "before-insert hook prevents multiple libraries"
    (t2/delete! :model/PythonLibrary)
    (t2/insert! :model/PythonLibrary {:source "def first(): pass"})
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Only one Python library can exist at a time"
                          (t2/insert! :model/PythonLibrary {:source "def second(): pass"})))
    (is (= 1 (t2/count :model/PythonLibrary)) "Should still have only one library")))
