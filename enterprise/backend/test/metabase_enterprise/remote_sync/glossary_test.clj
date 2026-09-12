(ns metabase-enterprise.remote-sync.glossary-test
  "Glossary entries are synced globally when the Library collection is remote-synced, like snippets."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as rs-events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as sync-object]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.events.core :as events]
   [metabase.glossary.core :as glossary.core]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- clean-remote-sync-state
  "Test fixture that cleans up remote sync state before and after each test."
  [f]
  (try
    (t2/delete! :model/RemoteSyncObject)
    (f)
    (finally
      (t2/delete! :model/RemoteSyncObject))))

(use-fixtures :each (fn [f]
                      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
                        (clean-remote-sync-state f))))

(defn- rso [entry]
  (t2/select-one :model/RemoteSyncObject :model_type "Glossary" :model_id (:id entry)))

(defn- with-rso! [entry status]
  (t2/insert! :model/RemoteSyncObject {:model_type        "Glossary"
                                       :model_id          (:id entry)
                                       :model_name        (:term entry)
                                       :status            status
                                       :status_changed_at (t/offset-date-time)
                                       :content_hash      (source/row->content-hash {:model_type "Glossary"
                                                                                     :model_id   (:id entry)})}))

;;; ------------------------------------------- Event Handler Tests -------------------------------------------

(deftest create-event-tracks-entry-when-library-synced-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-model-cleanup [:model/Glossary]
        (let [entry (glossary.core/create-entry! (mt/user->id :rasta) {:term "ARR" :definition "Annual recurring revenue"})]
          (is (=? {:status "create" :model_name "ARR"} (rso entry))))))))

(deftest create-event-ignored-when-library-not-synced-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-model-cleanup [:model/Glossary]
        (let [entry (glossary.core/create-entry! (mt/user->id :rasta) {:term "ARR" :definition "Annual recurring revenue"})]
          (is (nil? (rso entry))))))))

(deftest update-event-marks-synced-entry-for-update-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (with-rso! entry "synced")
        (testing "saving the same term and definition again stays synced"
          (glossary.core/update-entry! (mt/user->id :rasta) (:id entry) {:term "ARR" :definition "Annual recurring revenue"})
          (is (= "synced" (:status (rso entry)))))
        (testing "an update that changes the content flips to update and refreshes the tracked name"
          (glossary.core/update-entry! (mt/user->id :rasta) (:id entry) {:term "NRR" :definition "Net revenue retention"})
          (is (=? {:status "update" :model_name "NRR"} (rso entry))))))))

(deftest delete-event-test
  (collections.tu/with-library-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (testing "deleting a synced entry marks it for deletion and keeps the tracked name"
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (with-rso! entry "synced")
          (glossary.core/delete-entry! (mt/user->id :rasta) (:id entry))
          (is (=? {:status "delete" :model_name "ARR"} (rso entry)))))
      (testing "deleting a never-pushed entry drops its tracking row"
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (with-rso! entry "create")
          (glossary.core/delete-entry! (mt/user->id :rasta) (:id entry))
          (is (nil? (rso entry))))))))

;;; ------------------------------------------- Library Tracking Enable/Disable Tests -------------------------------------------

(deftest enable-library-tracking-marks-every-entry-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (rs-events/enable-library-tracking!)
        (is (=? {:status "create" :model_name "ARR"} (rso entry)))))))

(deftest disable-library-tracking-removes-every-entry-test
  (collections.tu/with-library-not-synced
    (mt/with-temporary-setting-values [remote-sync-enabled true]
      (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
        (with-rso! entry "synced")
        (rs-events/disable-library-tracking!)
        (is (nil? (rso entry)))))))

(deftest library-sync-status-change-toggles-glossary-tracking-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (collections.tu/with-library [{library :library}]
      (collections.tu/with-library-not-synced
        (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
          (let [publish! (fn []
                           (events/publish-event! :event/collection-update
                                                  {:object  (t2/select-one :model/Collection :id (:id library))
                                                   :user-id (mt/user->id :rasta)}))]
            (testing "the Library becoming remote-synced tracks existing entries"
              (t2/update! :model/Collection (:id library) {:is_remote_synced true})
              (publish!)
              (is (=? {:status "create"} (rso entry))))
            (testing "the Library ceasing to be remote-synced removes their tracking rows"
              (t2/update! :model/Collection (:id library) {:is_remote_synced false})
              (publish!)
              (is (nil? (rso entry))))))))))

;;; ------------------------------------------- Dirty Check Tests -------------------------------------------

(deftest dirty-check-test
  (mt/with-temporary-setting-values [remote-sync-enabled true]
    (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
      (with-rso! entry "update")
      (testing "a pending glossary change counts as dirty when the Library is synced"
        (collections.tu/with-library-synced
          (is (sync-object/dirty?))))
      (testing "and is ignored when the Library is not synced"
        (collections.tu/with-library-not-synced
          (is (not (sync-object/dirty?))))))))

;;; ------------------------------------------- Deletion Conflict Tests -------------------------------------------

(deftest unsynced-local-term-absent-from-import-is-a-deletion-conflict-test
  (collections.tu/with-library-synced
    (mt/with-temp [:model/Glossary entry {:term "ARR" :definition "Annual recurring revenue"}]
      (let [glossary-conflicts (fn [imported-data]
                                 (filter #(= "Glossary" (:model %))
                                         (spec/check-content-deletion-conflicts imported-data)))]
        (testing "a never-synced term the import would delete is reported with its term as the name"
          (is (=? [{:type :glossary-deletion-conflict :count 1 :names ["ARR"]}]
                  (glossary-conflicts {:by-entity-id {}}))))
        (testing "a term present in the import is not reported"
          (is (empty? (glossary-conflicts {:by-entity-id {"Glossary" #{(:entity_id entry)}}}))))
        (testing "an already-synced term is a normal reconcile, not a conflict"
          (with-rso! entry "synced")
          (is (empty? (glossary-conflicts {:by-entity-id {}}))))))))

;;; ------------------------------------------- First-Import Conflict Tests -------------------------------------------

(deftest unsynced-local-glossary-conflicts-with-imported-glossary-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "Annual recurring revenue"}]
    (testing "check-feature-conflicts reports Library content under the snippets conflict type"
      (let [[conflict :as conflicts] (spec/check-feature-conflicts #{"Glossary"} #{})]
        (is (= 1 (count conflicts)))
        (is (=? {:type :snippets-conflict :category "Snippets"} conflict))
        (is (str/includes? (:message conflict) "Library content (snippets, glossary)"))))
    (testing "import! surfaces the conflict"
      (mt/with-model-cleanup [:model/RemoteSyncTask]
        (let [task-id     (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                          :initiated_by   (mt/user->id :rasta)})
              test-files  {"main" {"collections/main/test_coll/test_coll.yaml"
                                   (test-helpers/generate-collection-yaml "test-collection-1xxxx" "Test Collection")
                                   "glossary/remote_term.yaml"
                                   (test-helpers/generate-glossary-yaml "test-glossary-xxxxxxx" "MRR" "Monthly recurring revenue")}}
              mock-source (test-helpers/create-mock-source :initial-files test-files)
              result      (impl/import! (source.p/snapshot mock-source) task-id)]
          (is (= :conflict (:status result)))
          (is (contains? (:conflicts result) "Snippets"))
          (is (some #(= :snippets-conflict (:type %)) (:conflict-details result))))))))
