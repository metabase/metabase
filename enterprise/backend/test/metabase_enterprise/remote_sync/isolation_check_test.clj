(ns metabase-enterprise.remote-sync.isolation-check-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.isolation-check-test-util :as isolation-check]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each rs.test/clean-remote-sync-state)

(def ^:private run-time-ns
  'metabase-enterprise.remote-sync.isolation-check-test.run-time)

(def ^:private other-run-time-ns
  'metabase-enterprise.remote-sync.isolation-check-test.other-run-time)

(defn- make-namespace-with-test!
  "Create the namespace `ns-sym` (default [[run-time-ns]]) with one test var, `test-fn` as its test, and the `:each`
  fixtures `each-fixtures` (default none)."
  ([test-fn]
   (make-namespace-with-test! run-time-ns test-fn []))
  ([ns-sym test-fn each-fixtures]
   (let [the-ns (create-ns ns-sym)
         v      (intern the-ns 'the-test (fn []))]
     (alter-meta! v assoc :ns the-ns :name 'the-test :test test-fn)
     (alter-meta! the-ns assoc :clojure.test/each-fixtures each-fixtures)
     v)))

(deftest isolation-check-reports-a-leaking-namespace-test
  (t2/delete! :setting :key "remote-sync-auto-import")
  (try
    (testing "a namespace whose test stores a remote-sync setting row"
      (make-namespace-with-test! (fn []
                                   (t2/insert! :setting {:key "remote-sync-auto-import" :value "true"})
                                   (is true)))
      (let [result (isolation-check/check-module! [run-time-ns])]
        (is (=? {:namespaces 1
                 :counts     {:pass 1 :fail 0 :error 0}
                 :leaks      [{:namespace run-time-ns
                               :settings  {"remote-sync-auto-import" {:before nil
                                                                      :after  {:key   "remote-sync-auto-import"
                                                                               :value "true"}}}}]}
                result))
        (testing "and no ledger difference"
          (is (not (contains? (first (:leaks result)) :ledger))))))
    (remove-ns run-time-ns)
    (t2/delete! :setting :key "remote-sync-auto-import")
    (testing "a namespace whose test stores nothing"
      (make-namespace-with-test! (fn [] (is true)))
      (is (= {:namespaces 1
              :counts     {:pass 1 :fail 0 :error 0}
              :leaks      []
              :errors     []}
             (isolation-check/check-module! [run-time-ns]))))
    (finally
      (remove-ns run-time-ns)
      (t2/delete! :setting :key "remote-sync-auto-import"))))

(deftest isolation-check-reports-content-and-task-rows-test
  (let [ids (atom {})]
    (try
      (testing "a namespace whose test adds a Collection row and a RemoteSyncTask row"
        (make-namespace-with-test! (fn []
                                     (swap! ids assoc
                                            :collection (t2/insert-returning-pk! :model/Collection
                                                                                 {:name "Isolation check leak"})
                                            :task       (t2/insert-returning-pk! :model/RemoteSyncTask
                                                                                 {:sync_task_type "import"}))
                                     (is true)))
        (let [result (isolation-check/check-module! [run-time-ns])]
          (is (=? {:namespaces 1
                   :leaks      [{:namespace run-time-ns
                                 :content   {:model/Collection {:added #{(:collection @ids)} :removed #{}}}
                                 :tasks     {:added #{(:task @ids)} :removed #{}}}]}
                  result))))
      (finally
        (remove-ns run-time-ns)
        (when-let [id (:collection @ids)]
          (t2/delete! :model/Collection :id id))
        (when-let [id (:task @ids)]
          (t2/delete! :model/RemoteSyncTask :id id))))))

(deftest isolation-check-goes-on-after-a-fixture-throws-test
  (t2/delete! :setting :key "remote-sync-auto-import")
  (try
    (testing "a namespace whose fixture throws, then a namespace that leaks a setting row"
      (make-namespace-with-test! run-time-ns
                                 (fn [] (is true))
                                 [(fn [_f] (throw (ex-info "The fixture fails" {})))])
      (make-namespace-with-test! other-run-time-ns
                                 (fn []
                                   (t2/insert! :setting {:key "remote-sync-auto-import" :value "true"})
                                   (is true))
                                 [])
      (let [result (isolation-check/check-module! [run-time-ns other-run-time-ns])]
        (is (=? {:namespaces 2
                 :errors     [{:namespace run-time-ns}]
                 :leaks      [{:namespace other-run-time-ns
                               :settings  {"remote-sync-auto-import" {:before nil}}}]}
                result))
        (is (= "The fixture fails"
               (ex-message (:exception (first (:errors result))))))))
    (finally
      (remove-ns run-time-ns)
      (remove-ns other-run-time-ns)
      (t2/delete! :setting :key "remote-sync-auto-import"))))
