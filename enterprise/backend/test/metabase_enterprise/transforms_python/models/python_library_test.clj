(ns metabase-enterprise.transforms-python.models.python-library-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase-enterprise.transforms-python.write :as transforms-python.write]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest update-python-library-source-test
  (testing "update-python-library-source!"
    (testing "creates new record when none exists"
      (t2/delete! :model/PythonLibrary)
      (is (=? {:source "def new_func(): return 1"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (transforms-python.write/update-python-library-source! "common" "def new_func(): return 1")))
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
              (transforms-python.write/update-python-library-source! "common" "def updated_func(): return 2")))
      (is (= 1 (t2/count :model/PythonLibrary)) "Should not create duplicate")
      (is (= "def updated_func(): return 2"
             (t2/select-one-fn :source :model/PythonLibrary))))))

(deftest get-python-library-by-path-test
  (testing "get-python-library-by-path"
    (testing "returns library when path is valid"
      (t2/delete! :model/PythonLibrary)
      (transforms-python.write/update-python-library-source! "common" "def test(): pass")
      (is (=? {:source "def test(): pass"
               :path "common.py"
               :id integer?
               :created_at some?
               :updated_at some?}
              (python-library/get-python-library-by-path "common"))))))

(deftest normalize-path-test
  (testing "normalize-path function"
    (testing "adds .py extension when missing"
      (is (= "common.py" (transforms-python.write/normalize-path "common"))))
    (testing "doesn't duplicate .py extension"
      (is (= "common.py" (transforms-python.write/normalize-path "common.py"))))
    (testing "works with paths that already have .py extension when updating"
      (t2/delete! :model/PythonLibrary)
      (transforms-python.write/update-python-library-source! "common.py" "def test(): pass")
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

(deftest is-default-cleared-by-a-source-change-test
  (testing "Saving the default library with its source unchanged keeps it the default one"
    (t2/delete! :model/PythonLibrary)
    (t2/insert! :model/PythonLibrary {:path "common.py" :source "" :entity_id (u/generate-nano-id) :is_default true})
    (transforms-python.write/update-python-library-source! "common" "")
    (is (true? (t2/select-one-fn :is_default :model/PythonLibrary :path "common.py"))))
  (testing "while changing its source makes it no longer the default one"
    (transforms-python.write/update-python-library-source! "common" "def f(): pass")
    (is (false? (t2/select-one-fn :is_default :model/PythonLibrary :path "common.py")))))

(deftest recreated-library-is-the-built-in-one-test
  (testing "A recreated common.py takes the built-in entity_id, and is the default one only with an empty source"
    (doseq [[source default?] [["" true] ["def f(): pass" false]]]
      (testing (pr-str source)
        (t2/delete! :model/PythonLibrary)
        (transforms-python.write/update-python-library-source! "common" source)
        (is (=? {:entity_id transforms-python.write/builtin-entity-id :is_default default?}
                (t2/select-one :model/PythonLibrary :path "common.py")))))))

(deftest only-common-path-is-written-by-request-test
  (t2/delete! :model/PythonLibrary)
  (testing "a request path other than common is refused by the request schema"
    (is (not (mr/validate ::transforms-python.schema/python-library.request-path "other")))
    (is (mr/validate ::transforms-python.schema/python-library.request-path "common"))
    (is (mr/validate ::transforms-python.schema/python-library.request-path "common.py")))
  (testing "a library of another path that is stored or imported is accepted by the model"
    (let [id (t2/insert-returning-pk! :model/PythonLibrary {:path "shared" :source "" :entity_id (u/generate-nano-id)})]
      (is (= "shared.py" (t2/select-one-fn :path :model/PythonLibrary :id id)))
      (t2/update! :model/PythonLibrary :id id {:source "def helper(): pass"})
      (is (= "def helper(): pass" (t2/select-one-fn :source :model/PythonLibrary :id id))))))

(deftest update-python-library-publishes-update-event-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::library-events
                                     (fn [{:keys [model]}] (when (= :model/PythonLibrary model) :library))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (t2/delete! :model/PythonLibrary)
      (let [library (transforms-python.write/update-python-library-source! "common" "def f(): pass")]
        (reset! published [])
        (transforms-python.write/update-python-library! (:id library) {:source "def g(): pass"} {})
        (testing "one update event with the row before and after the update"
          (is (=? [{:operation       :update
                    :id              (:id library)
                    :previous-object {:source "def f(): pass" :is_default false}
                    :object          {:source "def g(): pass" :is_default false}}]
                  @published))))
      (finally
        (events.tu/unregister! ::library-events)))))

(deftest update-python-library-query-count-test
  (testing "a warm update-python-library! issues 2 queries, as master's t2/update! with the hooks did"
    (t2/delete! :model/PythonLibrary)
    (let [{id :id} (transforms-python.write/update-python-library-source! "common" "def f(): pass")]
      (binding [search.ingestion/*disable-updates* true]
        (transforms-python.write/update-python-library! id {:source "def warm(): pass"} {})
        (t2/with-call-count [call-count]
          (transforms-python.write/update-python-library! id {:source "def g(): pass"} {})
          (is (<= (call-count) 2)))))))
