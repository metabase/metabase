(ns metabase-enterprise.transforms-python.models.python-library-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-python-library-source-test
  (testing "update-python-library-source!"
    (testing "creates new record when none exists"
      (t2/delete! :model/PythonLibrary)
      (is (=? {:source "def new_func(): return 1"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (python-library/update-python-library-source! "common" "def new_func(): return 1")))
      (is (= 1 (t2/count :model/PythonLibrary)))
      (is (= "def new_func(): return 1"
             (t2/select-one-fn :source :model/PythonLibrary))))

    (testing "updates existing record"
      (is (= 1 (t2/count :model/PythonLibrary)))
      (is (=? {:source "def updated_func(): return 2"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (python-library/update-python-library-source! "common" "def updated_func(): return 2")))
      (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate")
      (is (= "def updated_func(): return 2"
             (t2/select-one-fn :source :model/PythonLibrary))))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (python-library/update-python-library-source! "invalid-path" "def test(): pass")))
      (is (= 1 (t2/count :model/PythonLibrary)) "Should not create library with invalid path"))))

(deftest get-python-library-by-path-test
  (testing "get-python-library-by-path"
    (testing "returns library when path is valid"
      (t2/delete! :model/PythonLibrary)
      (python-library/update-python-library-source! "common" "def test(): pass")
      (is (=? {:source "def test(): pass"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (python-library/get-python-library-by-path "common"))))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (python-library/get-python-library-by-path "invalid-path"))))))

(deftest normalize-path-test
  (testing "normalize-path function"
    (testing "adds .py extension when missing"
      (is (= "common.py" (#'python-library/normalize-path "common"))))

    (testing "doesn't duplicate .py extension"
      (is (= "common.py" (#'python-library/normalize-path "common.py"))))

    (testing "works with paths that already have .py extension when updating"
      (t2/delete! :model/PythonLibrary)
      (python-library/update-python-library-source! "common.py" "def test(): pass")
      (is (=? {:source "def test(): pass"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (python-library/get-python-library-by-path "common.py")))
      ;; Verify we can also access it without .py
      (is (=? {:source "def test(): pass"
               :path "common.py"}
              (python-library/get-python-library-by-path "common"))))))
