(ns metabase-enterprise.remote-sync.test-isolation-test
  "Tests that remote-sync tests leave no stored setting value and no ledger row behind."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.api-test :as api-test]
   [metabase-enterprise.remote-sync.content-hash-test :as content-hash-test]
   [metabase-enterprise.remote-sync.spec-test :as spec-test]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.settings.core :as setting]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- stored-value
  "The value of the `setting` row for `setting-key`, or nil when no row exists."
  [setting-key]
  (t2/select-one-fn :value :model/Setting :key (name setting-key)))

(defn- run-var-quietly
  "Run test var `v` with its namespace's fixtures. Returns its counts as `{:pass n :fail n :error n}`; its failures
  are not reported to the calling test."
  [v]
  (let [results (atom {:pass 0 :fail 0 :error 0})]
    (binding [*test-out*        (java.io.StringWriter.)
              *report-counters* (ref *initial-report-counters*)
              report            (fn [m]
                                  (when (#{:pass :fail :error} (:type m))
                                    (swap! results update (:type m) inc)))]
      (test-vars [v]))
    @results))

(def ^:private restored-settings
  ;; `remote-sync-transforms` is here for both tests: `clean-remote-sync-state` removes its stored value
  [:remote-sync-transforms :remote-sync-auto-import])

(defn- do-without-stored-value!
  "Remove the stored value of `setting-key`, call `thunk`, then put back the stored values of [[restored-settings]]
  and the RemoteSyncObject rows that existed before."
  [setting-key thunk]
  (let [old-values (into {} (map (juxt identity stored-value)) restored-settings)
        old-rows   (t2/select :model/RemoteSyncObject)]
    (try
      (setting/set! setting-key nil)
      (thunk)
      (finally
        (doseq [[k v] old-values]
          (setting/set! k v))
        ;; restoring `remote-sync-transforms` runs its `:on-change` hook, which writes a ledger row
        (t2/delete! :model/RemoteSyncObject)
        (when (seq old-rows)
          (t2/insert! :model/RemoteSyncObject old-rows))))))

(deftest transform-import-test-stores-no-transforms-setting-test
  (testing "transform-import-then-noop-stays-synced-test leaves no stored remote-sync-transforms value"
    (do-without-stored-value!
     :remote-sync-transforms
     (fn []
       (is (= {:pass 3 :fail 0 :error 0}
              (run-var-quietly #'content-hash-test/transform-import-then-noop-stays-synced-test)))
       (is (nil? (stored-value :remote-sync-transforms)))))))

(deftest transform-tag-import-test-stores-no-transforms-setting-test
  (testing "transform-tag-import-then-noop-stays-synced-test leaves no stored remote-sync-transforms value"
    (do-without-stored-value!
     :remote-sync-transforms
     (fn []
       (is (= {:pass 3 :fail 0 :error 0}
              (run-var-quietly #'content-hash-test/transform-tag-import-then-noop-stays-synced-test)))
       (is (nil? (stored-value :remote-sync-transforms)))))))

(deftest settings-api-test-stores-no-auto-import-setting-test
  (testing "settings-preserves-transforms-when-not-specified-test leaves no stored remote-sync-auto-import value"
    (do-without-stored-value!
     :remote-sync-auto-import
     (fn []
       (is (= {:pass 4 :fail 0 :error 0}
              (run-var-quietly #'api-test/settings-preserves-transforms-when-not-specified-test)))
       (is (nil? (stored-value :remote-sync-auto-import)))))))

(deftest transforms-binding-test-leaves-no-ledger-row-test
  (testing "excluded-model-types-test binds remote-sync-transforms and leaves no ledger row"
    (let [old-rows (t2/select :model/RemoteSyncObject)]
      (try
        (t2/delete! :model/RemoteSyncObject)
        (is (= {:pass 10 :fail 0 :error 0}
               (run-var-quietly #'spec-test/excluded-model-types-test)))
        (is (= [] (t2/select-fn-vec (juxt :model_type :model_id :status) :model/RemoteSyncObject)))
        (finally
          (t2/delete! :model/RemoteSyncObject)
          (when (seq old-rows)
            (t2/insert! :model/RemoteSyncObject old-rows)))))))

(defn- remote-sync-setting-rows
  "The raw `setting` rows whose key starts with `remote-sync`."
  []
  (set (t2/select :setting :key [:like "remote-sync%"])))

(deftest transform-tag-import-test-leaves-no-setting-or-ledger-row-test
  (testing "transform-tag-import-then-noop-stays-synced-test binds remote-sync-enabled and leaves no setting row and no
            ledger row"
    (rs.test/clean-object
     (fn []
       (rs.test/clean-remote-sync-settings
        (fn []
          ;; with no stored row, a binding that ends stores the earlier getter value as a new row
          (t2/delete! :setting :key "remote-sync-enabled")
          (setting/restore-cache!)
          (let [rows (remote-sync-setting-rows)]
            (is (= {:pass 3 :fail 0 :error 0}
                   (run-var-quietly #'content-hash-test/transform-tag-import-then-noop-stays-synced-test)))
            (is (= rows (remote-sync-setting-rows)))
            (is (= [] (t2/select-fn-vec (juxt :model_type :status) :model/RemoteSyncObject))))))))))
