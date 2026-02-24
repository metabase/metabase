(ns metabase-enterprise.transforms-javascript.models.javascript-library-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-javascript.models.javascript-library :as javascript-library]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-javascript-library-source-test
  (testing "update-javascript-library-source!"
    (testing "creates new record when none exists"
      (t2/delete! :model/JavaScriptLibrary)
      (is (=? {:source "function newFunc() { return 1; }"
               :path "common.js"
               :id integer?
               :created_at some?
               :updated_at some?}
              (javascript-library/update-javascript-library-source! "common" "function newFunc() { return 1; }")))
      (is (= 1 (t2/count :model/JavaScriptLibrary)))
      (is (= "function newFunc() { return 1; }"
             (t2/select-one-fn :source :model/JavaScriptLibrary))))

    (testing "updates existing record"
      (is (= 1 (t2/count :model/JavaScriptLibrary)))
      (is (=? {:source "function updatedFunc() { return 2; }"
               :path "common.js"
               :id integer?
               :created_at some?
               :updated_at some?}
              (javascript-library/update-javascript-library-source! "common" "function updatedFunc() { return 2; }")))
      (is (= 1 (t2/count :model/JavaScriptLibrary)) "Should not create duplicate")
      (is (= "function updatedFunc() { return 2; }"
             (t2/select-one-fn :source :model/JavaScriptLibrary))))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (javascript-library/update-javascript-library-source! "invalid-path" "function test() {}")))
      (is (= 1 (t2/count :model/JavaScriptLibrary)) "Should not create library with invalid path"))))

(deftest get-javascript-library-by-path-test
  (testing "get-javascript-library-by-path"
    (testing "returns library when path is valid"
      (t2/delete! :model/JavaScriptLibrary)
      (javascript-library/update-javascript-library-source! "common" "function test() {}")
      (is (=? {:source "function test() {}"
               :path "common.js"
               :id integer?
               :created_at some?
               :updated_at some?}
              (javascript-library/get-javascript-library-by-path "common"))))

    (testing "rejects invalid paths"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid library path"
                            (javascript-library/get-javascript-library-by-path "invalid-path"))))))

(deftest normalize-path-test
  (testing "normalize-path function"
    (testing "adds .js extension when missing"
      (is (= "common.js" (#'javascript-library/normalize-path "common"))))

    (testing "doesn't duplicate .js extension"
      (is (= "common.js" (#'javascript-library/normalize-path "common.js"))))

    (testing "works with paths that already have .js extension when updating"
      (t2/delete! :model/JavaScriptLibrary)
      (javascript-library/update-javascript-library-source! "common.js" "function test() {}")
      (is (=? {:source "function test() {}"
               :path "common.js"
               :id integer?
               :created_at some?
               :updated_at some?}
              (javascript-library/get-javascript-library-by-path "common.js")))
      ;; Verify we can also access it without .js
      (is (=? {:source "function test() {}"
               :path "common.js"}
              (javascript-library/get-javascript-library-by-path "common"))))))
