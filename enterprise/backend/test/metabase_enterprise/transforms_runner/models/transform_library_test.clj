(ns metabase-enterprise.transforms-runner.models.transform-library-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-runner.models.transform-library :as transform-library]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- clean-libraries! []
  (t2/delete! :model/TransformLibrary))

(deftest update-library-source-python-test
  (testing "update-library-source! for python"
    (testing "creates new record when none exists"
      (clean-libraries!)
      (is (=? {:source "def new_func(): return 1"
               :path "common.py"
               :language "python"
               :id integer?
               :created_at some?
               :updated_at some?}
              (transform-library/update-library-source! "python" "common" "def new_func(): return 1")))
      (is (= 1 (t2/count :model/TransformLibrary :language "python"))))

    (testing "updates existing record"
      (is (=? {:source "def updated(): return 2"
               :path "common.py"
               :language "python"}
              (transform-library/update-library-source! "python" "common" "def updated(): return 2")))
      (is (= 1 (t2/count :model/TransformLibrary :language "python")) "Should not create duplicate"))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (transform-library/update-library-source! "python" "invalid-path" "code"))))))

(deftest update-library-source-javascript-test
  (testing "update-library-source! for javascript"
    (testing "creates new record when none exists"
      (clean-libraries!)
      (is (=? {:source "function newFunc() { return 1; }"
               :path "common.js"
               :language "javascript"
               :id integer?
               :created_at some?
               :updated_at some?}
              (transform-library/update-library-source! "javascript" "common" "function newFunc() { return 1; }")))
      (is (= 1 (t2/count :model/TransformLibrary :language "javascript"))))

    (testing "updates existing record"
      (is (=? {:source "function updated() { return 2; }"
               :path "common.js"
               :language "javascript"}
              (transform-library/update-library-source! "javascript" "common" "function updated() { return 2; }")))
      (is (= 1 (t2/count :model/TransformLibrary :language "javascript")) "Should not create duplicate"))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (transform-library/update-library-source! "javascript" "invalid-path" "code"))))))

(deftest get-library-by-path-test
  (testing "get-library-by-path"
    (clean-libraries!)
    (transform-library/update-library-source! "python" "common" "py code")
    (transform-library/update-library-source! "javascript" "common" "js code")

    (testing "returns python library"
      (is (=? {:source "py code" :path "common.py" :language "python"}
              (transform-library/get-library-by-path "python" "common"))))

    (testing "returns javascript library"
      (is (=? {:source "js code" :path "common.js" :language "javascript"}
              (transform-library/get-library-by-path "javascript" "common"))))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (transform-library/get-library-by-path "python" "invalid")))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (transform-library/get-library-by-path "javascript" "invalid"))))))

(deftest normalize-path-test
  (testing "normalize-path adds correct extension per language"
    (is (= "common.py" (#'transform-library/normalize-path "python" "common")))
    (is (= "common.js" (#'transform-library/normalize-path "javascript" "common")))
    (is (= "common.clj" (#'transform-library/normalize-path "clojure" "common"))))

  (testing "does not duplicate extension"
    (is (= "common.py" (#'transform-library/normalize-path "python" "common.py")))
    (is (= "common.js" (#'transform-library/normalize-path "javascript" "common.js"))))

  (testing "works with extension when fetching"
    (clean-libraries!)
    (transform-library/update-library-source! "python" "common.py" "code1")
    (is (=? {:source "code1" :path "common.py"}
            (transform-library/get-library-by-path "python" "common.py")))
    (is (=? {:source "code1" :path "common.py"}
            (transform-library/get-library-by-path "python" "common")))))

(deftest language-isolation-test
  (testing "libraries for different languages are independent"
    (clean-libraries!)
    (transform-library/update-library-source! "python" "common" "py-source")
    (transform-library/update-library-source! "javascript" "common" "js-source")
    (is (= 2 (t2/count :model/TransformLibrary)))
    (is (= "py-source" (:source (transform-library/get-library-by-path "python" "common"))))
    (is (= "js-source" (:source (transform-library/get-library-by-path "javascript" "common"))))

    (testing "updating one language does not affect the other"
      (transform-library/update-library-source! "python" "common" "py-updated")
      (is (= "py-updated" (:source (transform-library/get-library-by-path "python" "common"))))
      (is (= "js-source" (:source (transform-library/get-library-by-path "javascript" "common")))))))

(deftest builtin-entity-ids-test
  (testing "builtin-entity-ids map contains expected values"
    (is (= "cWWH9qJPvHNB3rP2vLZrK" (get transform-library/builtin-entity-ids "python")))
    (is (= "aHWo_0yPLwKqpQPlFNzCg" (get transform-library/builtin-entity-ids "javascript")))))