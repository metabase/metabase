(ns metabase-enterprise.remote-sync.isolation-check-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.isolation-check :as isolation-check]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each rs.test/clean-remote-sync-state)

(def ^:private run-time-ns
  'metabase-enterprise.remote-sync.isolation-check-test.run-time)

(defn- make-namespace-with-test!
  "Create the namespace [[run-time-ns]] with one test var, `test-fn` as its test, and no fixture."
  [test-fn]
  (let [the-ns (create-ns run-time-ns)
        v      (intern the-ns 'the-test (fn []))]
    (alter-meta! v assoc :ns the-ns :name 'the-test :test test-fn)
    v))

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
              :leaks      []}
             (isolation-check/check-module! [run-time-ns]))))
    (finally
      (remove-ns run-time-ns)
      (t2/delete! :setting :key "remote-sync-auto-import"))))
