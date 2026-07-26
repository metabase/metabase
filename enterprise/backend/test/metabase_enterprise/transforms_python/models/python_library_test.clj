(ns metabase-enterprise.transforms-python.models.python-library-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

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

(deftest workspace-isolation-test
  (testing "get-python-library-by-path is scoped to the current workspace"
    ;; python_library.path still carries a single-column (non-workspace-scoped) unique index (uk_python_library_path,
    ;; from migration v57.2025-09-11T10:00:00), so a workspace and the main app can't yet hold a same-path row at the
    ;; same time -- these tests exercise one scope's row at a time rather than a coexistence scenario.
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
      (try
        (testing "a library created inside a workspace is invisible from the main app"
          (t2/delete! :model/PythonLibrary)
          (binding [api/*current-workspace-id* (:id wt)]
            (python-library/update-python-library-source! "common" "def wt_version(): return 2"))
          (is (= 1 (t2/count :model/PythonLibrary)))
          (is (nil? (python-library/get-python-library-by-path "common")))
          (binding [api/*current-workspace-id* (:id wt)]
            (is (= "def wt_version(): return 2"
                   (:source (python-library/get-python-library-by-path "common"))))))
        (testing "a library created in the main app is invisible from a workspace"
          (t2/delete! :model/PythonLibrary)
          (python-library/update-python-library-source! "common" "def main_version(): return 1")
          (is (= "def main_version(): return 1"
                 (:source (python-library/get-python-library-by-path "common"))))
          (binding [api/*current-workspace-id* (:id wt)]
            (is (nil? (python-library/get-python-library-by-path "common")))))
        (finally
          ;; When :remote-sync-transforms is enabled (e.g. leaked from a concurrent test on CI) the workspace-scoped
          ;; PythonLibrary gets a workspace-scoped RemoteSyncObject. Clear any such rows before with-temp deletes the
          ;; workspace, or the FK remote_sync_object.workspace_id -> workspace.id blocks the delete.
          (t2/delete! :model/RemoteSyncObject :workspace_id (:id wt)))))))

(deftest execute-python-code-http-call-workspace-isolation-test
  (testing "execute-python-code-http-call! only sends the current workspace's PythonLibrary source to the runner"
    (mt/with-temp [:model/Workspace wt {:branch (str (random-uuid))}]
      (try
        (let [captured     (atom ::not-called)
              fake-request (fn [opts & _]
                             (reset! captured (get (json/decode (:body opts)) "library"))
                             {:status 200 :body "{}"})
              call!        (fn [run-id]
                             (python-runner/execute-python-code-http-call!
                              {:server-url "http://fake" :code "pass" :run-id run-id
                               :source-tables [] :shared-storage {:objects {}}}))]
          (testing "a library created inside a workspace is only sent when running as that workspace"
            (t2/delete! :model/PythonLibrary)
            (binding [api/*current-workspace-id* (:id wt)]
              (python-library/update-python-library-source! "common" "def wt_only(): return 'wt'"))
            (with-redefs [http/request fake-request]
              (binding [api/*current-workspace-id* (:id wt)]
                (call! 1)))
            (is (= {"common.py" "def wt_only(): return 'wt'"} @captured))
            (with-redefs [http/request fake-request]
              (binding [api/*current-workspace-id* nil]
                (call! 2)))
            (is (= {} @captured) "the main app run never sees the workspace's library"))
          (testing "a library created in the main app is only sent when running outside any workspace"
            (t2/delete! :model/PythonLibrary)
            (python-library/update-python-library-source! "common" "def main_only(): return 'main'")
            (with-redefs [http/request fake-request]
              (binding [api/*current-workspace-id* (:id wt)]
                (call! 3)))
            (is (= {} @captured) "the workspace run never sees the main app's library")
            (with-redefs [http/request fake-request]
              (binding [api/*current-workspace-id* nil]
                (call! 4)))
            (is (= {"common.py" "def main_only(): return 'main'"} @captured))))
        (finally
          ;; See workspace-isolation-test: clear any workspace-scoped RemoteSyncObject rows before with-temp deletes
          ;; the workspace, or the FK remote_sync_object.workspace_id -> workspace.id blocks the delete.
          (t2/delete! :model/RemoteSyncObject :workspace_id (:id wt)))))))
