(ns metabase-enterprise.remote-sync.spec-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Spec Validation Tests ---------------------------------------------

(deftest all-specs-have-required-keys-test
  (testing "Every spec has all required keys"
    (let [required-keys #{:model-type :model-key :identity :events :eligibility
                          :archived-key :tracking :removal :enabled?}]
      (doseq [[model-key spec] spec/remote-sync-specs]
        (testing (str "Spec for " model-key)
          (let [missing-keys (set/difference required-keys (set (keys spec)))]
            (is (empty? missing-keys)
                (str "Missing keys: " missing-keys))))))))

(deftest all-specs-have-valid-identity-test
  (testing "Every spec has a valid identity type"
    (let [valid-identity-types #{:entity-id :path :hybrid}]
      (doseq [[model-key spec] spec/remote-sync-specs]
        (testing (str "Spec for " model-key)
          (is (contains? valid-identity-types (:identity spec))
              (str "Invalid identity type: " (:identity spec))))))))

(deftest path-based-specs-have-path-keys-test
  (testing "Specs with :path or :hybrid identity have :path-keys"
    (doseq [[model-key spec] spec/remote-sync-specs
            :when (#{:path :hybrid} (:identity spec))]
      (testing (str "Spec for " model-key)
        (is (vector? (:path-keys spec))
            "path-keys should be a vector")
        (is (seq (:path-keys spec))
            "path-keys should not be empty")))))

(deftest all-specs-have-valid-eligibility-test
  (testing "Every spec has a valid eligibility type"
    (let [valid-eligibility-types #{:collection :published-table :parent-table :setting :library-synced}]
      (doseq [[model-key spec] spec/remote-sync-specs]
        (testing (str "Spec for " model-key)
          (is (contains? valid-eligibility-types (get-in spec [:eligibility :type]))
              (str "Invalid eligibility type: " (get-in spec [:eligibility :type]))))))))

(deftest all-specs-have-valid-events-test
  (testing "Every spec has valid events configuration"
    (doseq [[model-key spec] spec/remote-sync-specs]
      (testing (str "Spec for " model-key)
        (is (keyword? (get-in spec [:events :prefix]))
            "events :prefix should be a keyword")
        (is (vector? (get-in spec [:events :types]))
            "events :types should be a vector")
        (is (every? #{:create :update :delete :publish :unpublish} (get-in spec [:events :types]))
            "events :types should only contain :create, :update, :delete, :publish, :unpublish")))))

(deftest all-specs-have-valid-tracking-test
  (testing "Every spec has valid tracking configuration"
    (doseq [[model-key spec] spec/remote-sync-specs]
      (testing (str "Spec for " model-key)
        (let [tracking (:tracking spec)]
          (is (or (contains? tracking :select-fields)
                  (contains? tracking :hydrate-query))
              "tracking should have either :select-fields or :hydrate-query")
          (is (map? (:field-mappings tracking))
              "tracking :field-mappings should be a map"))))))

(deftest all-specs-have-valid-removal-test
  (testing "Every spec has valid removal configuration"
    (doseq [[model-key spec] spec/remote-sync-specs]
      (testing (str "Spec for " model-key)
        (is (set? (get-in spec [:removal :statuses]))
            "removal :statuses should be a set")
        ;; :scope-key is optional - if present it should be a keyword
        (when-let [scope-key (get-in spec [:removal :scope-key])]
          (is (keyword? scope-key)
              "removal :scope-key should be a keyword when present"))))))

(deftest parent-fk-specs-are-valid-test
  (testing "Every spec with :parent-model and :parent-fk has a keyword :parent-fk"
    (doseq [[model-key spec] spec/remote-sync-specs
            :when (and (:parent-model spec)
                       (:parent-fk spec))]
      (testing (str "Spec for " model-key)
        (is (keyword? (:parent-fk spec))
            ":parent-fk should be a keyword")
        (when-let [cf (:cascade-filter spec)]
          (is (map? cf)
              ":cascade-filter should be a map when present")))))

  (testing "children-specs derives the correct children for Table"
    (let [children (spec/children-specs :model/Table)]
      (is (= 1 (count children)))
      (is (= #{:model/Field}
             (into #{} (map :model-key) children)))))

  (testing "children-specs returns empty for models with no children"
    (is (empty? (spec/children-specs :model/Card)))))

;;; ------------------------------------------------ Helper Function Tests ---------------------------------------------

(deftest spec-for-model-type-test
  (testing "spec-for-model-type returns correct spec"
    (is (= :model/Card (:model-key (spec/spec-for-model-type "Card"))))
    (is (= :model/Dashboard (:model-key (spec/spec-for-model-type "Dashboard"))))
    (is (= :model/Table (:model-key (spec/spec-for-model-type "Table"))))
    (is (= :model/Measure (:model-key (spec/spec-for-model-type "Measure"))))
    (is (nil? (spec/spec-for-model-type "NonExistent")))))

(deftest spec-for-model-key-test
  (testing "spec-for-model-key returns correct spec"
    (is (= "Card" (:model-type (spec/spec-for-model-key :model/Card))))
    (is (= "Dashboard" (:model-type (spec/spec-for-model-key :model/Dashboard))))
    (is (= "Measure" (:model-type (spec/spec-for-model-key :model/Measure))))
    (is (nil? (spec/spec-for-model-key :model/NonExistent)))))

(deftest all-model-types-test
  (testing "all-model-types returns all model type strings"
    (let [types (spec/all-model-types)]
      (is (set? types))
      (is (contains? types "Card"))
      (is (contains? types "Dashboard"))
      (is (contains? types "Table"))
      (is (contains? types "Field"))
      (is (contains? types "Segment"))
      (is (contains? types "Measure"))
      (is (contains? types "Transform"))
      (is (contains? types "TransformTag"))
      (is (= 13 (count types))))))

(deftest specs-by-identity-type-test
  (testing "specs-by-identity-type filters correctly"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (let [entity-id-specs (spec/specs-by-identity-type :entity-id)
            path-specs (spec/specs-by-identity-type :path)
            hybrid-specs (spec/specs-by-identity-type :hybrid)]
        (testing "entity-id specs"
          (is (contains? entity-id-specs :model/Card))
          (is (contains? entity-id-specs :model/Dashboard))
          (is (contains? entity-id-specs :model/Collection))
          (is (not (contains? entity-id-specs :model/Table)))
          (is (not (contains? entity-id-specs :model/Field))))
        (testing "path specs"
          (is (contains? path-specs :model/Table))
          (is (contains? path-specs :model/Field))
          (is (not (contains? path-specs :model/Card))))
        (testing "hybrid specs"
          (is (contains? hybrid-specs :model/Segment))
          (is (contains? hybrid-specs :model/Measure))
          (is (not (contains? hybrid-specs :model/Card))))))))

(deftest excluded-model-types-test
  (testing "excluded-model-types when transforms disabled"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (let [excluded (spec/excluded-model-types)]
        (is (contains? excluded "Transform"))
        (is (contains? excluded "TransformTag"))
        (is (not (contains? excluded "Card")))
        (is (not (contains? excluded "Dashboard"))))))

  (testing "excluded-model-types when transforms enabled"
    (mt/with-temporary-setting-values [remote-sync-transforms true]
      (let [excluded (spec/excluded-model-types)]
        ;; NativeQuerySnippet is still excluded because Library isn't remote-synced
        (is (not (contains? excluded "Transform")))
        (is (not (contains? excluded "TransformTag")))
        (is (contains? excluded "NativeQuerySnippet"))))))

(deftest spec-enabled?-test
  (testing "spec-enabled? with always-enabled spec"
    (is (true? (spec/spec-enabled? {:enabled? true}))))

  (testing "spec-enabled? with setting-based spec"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (is (false? (spec/spec-enabled? {:enabled? :remote-sync-transforms}))))

    (mt/with-temporary-setting-values [remote-sync-transforms true]
      (is (true? (spec/spec-enabled? {:enabled? :remote-sync-transforms}))))))

(deftest enabled-specs-test
  (testing "enabled-specs excludes setting-disabled specs"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (let [enabled (spec/enabled-specs)]
        (is (contains? enabled :model/Card))
        (is (contains? enabled :model/Dashboard))
        (is (not (contains? enabled :model/Transform)))
        (is (not (contains? enabled :model/TransformTag)))))

    (mt/with-temporary-setting-values [remote-sync-transforms true]
      (let [enabled (spec/enabled-specs)]
        (is (contains? enabled :model/Card))
        (is (contains? enabled :model/Transform))
        (is (contains? enabled :model/TransformTag))))))

;;; ------------------------------------------------ Event Helper Tests ------------------------------------------------

(deftest determine-status-test
  (testing "determine-status for create event"
    (let [spec (spec/spec-for-model-key :model/Card)]
      (is (= "create" (spec/determine-status spec :event/card-create {:archived false})))))

  (testing "determine-status for update event"
    (let [spec (spec/spec-for-model-key :model/Card)]
      (is (= "update" (spec/determine-status spec :event/card-update {:archived false})))))

  (testing "determine-status for delete event"
    (let [spec (spec/spec-for-model-key :model/Card)]
      (is (= "delete" (spec/determine-status spec :event/card-delete {:archived false})))))

  (testing "determine-status for archived object returns delete"
    (let [spec (spec/spec-for-model-key :model/Card)]
      (is (= "delete" (spec/determine-status spec :event/card-update {:archived true}))))))

(deftest event-keywords-test
  (testing "event-keywords generates correct keywords"
    (let [spec (spec/spec-for-model-key :model/Card)
          keywords (spec/event-keywords spec)]
      (is (= :metabase-enterprise.remote-sync.events/card-change-event (:parent keywords)))
      (is (= :event/card-create (:create keywords)))
      (is (= :event/card-update (:update keywords)))
      (is (= :event/card-delete (:delete keywords))))))

;;; -------------------------------------------- Build Sync Object Fields Tests ----------------------------------------

(deftest build-sync-object-fields-test
  (testing "build-sync-object-fields with simple mappings"
    (let [spec (spec/spec-for-model-key :model/Dashboard)
          details {:name "My Dashboard" :collection_id 123}
          fields (spec/build-sync-object-fields spec details)]
      (is (= "My Dashboard" (:model_name fields)))
      (is (= 123 (:model_collection_id fields)))))

  (testing "build-sync-object-fields with transform function"
    (let [spec (spec/spec-for-model-key :model/Card)
          details {:name "My Card" :collection_id 456 :display :table}
          fields (spec/build-sync-object-fields spec details)]
      (is (= "My Card" (:model_name fields)))
      (is (= 456 (:model_collection_id fields)))
      (is (= "table" (:model_display fields)))))

  (testing "build-sync-object-fields with nil details returns nil"
    (let [spec (spec/spec-for-model-key :model/Card)]
      (is (nil? (spec/build-sync-object-fields spec nil))))))

;;; ------------------------------------------- Removal Path Building Tests ------------------------------------------

;; Note: build-all-removal-paths uses serdes/storage-path to generate paths.
;; The actual paths are tested in impl_test.clj integration tests which verify
;; the full export/import cycle with real database entities.

;;; --------------------------------------------- Fields for Sync Tests -----------------------------------------------

(deftest fields-for-sync-test
  (testing "fields-for-sync returns spec fields"
    (is (= [:name :collection_id :display]
           (spec/fields-for-sync "Card")))
    (is (= [:name :collection_id]
           (spec/fields-for-sync "Dashboard")))
    (is (= [:name :collection_id]
           (spec/fields-for-sync "NativeQuerySnippet"))))

  (testing "fields-for-sync returns default for unknown type"
    (is (= [:id :name :collection_id]
           (spec/fields-for-sync "UnknownModel")))))

;;; --------------------------------------------- Export Scope Tests -------------------------------------------------

(deftest all-specs-have-valid-export-scope-test
  (testing "Every spec with :export-scope has a valid value"
    (let [valid-export-scopes #{:root-collections :root-only :all :derived}]
      (doseq [[model-key spec] spec/remote-sync-specs
              :when (contains? spec :export-scope)]
        (testing (str "Spec for " model-key)
          (is (contains? valid-export-scopes (:export-scope spec))
              (str "Invalid export-scope: " (:export-scope spec))))))))

(deftest export-scope-required-for-certain-models-test
  (testing "Collection spec has :root-collections export-scope"
    (is (= :root-collections (:export-scope (spec/spec-for-model-key :model/Collection)))))

  (testing "Transform spec has :root-only export-scope"
    (is (= :root-only (:export-scope (spec/spec-for-model-key :model/Transform)))))

  (testing "TransformTag spec has :all export-scope"
    (is (= :all (:export-scope (spec/spec-for-model-key :model/TransformTag)))))

  (testing "Other collection-based models have no export-scope (defaults to :derived)"
    (is (nil? (:export-scope (spec/spec-for-model-key :model/Card))))
    (is (nil? (:export-scope (spec/spec-for-model-key :model/Dashboard))))))

;;; --------------------------------------------- Query Export Roots Tests -------------------------------------------

(deftest query-export-roots-collection-eligibility-test
  (testing "query-export-roots with :collection eligibility and :derived scope returns nil"
    (let [card-spec (spec/spec-for-model-key :model/Card)]
      (is (nil? (spec/query-export-roots card-spec)))))

  (testing "query-export-roots with :collection eligibility and :root-collections scope queries collections"
    ;; This test verifies the multimethod dispatches correctly - actual database queries
    ;; are tested in impl_test.clj integration tests
    (let [collection-spec (spec/spec-for-model-key :model/Collection)]
      ;; The function should run without error (returns empty when no remote-synced collections)
      (is (not (nil? (spec/query-export-roots collection-spec)))))))

(deftest query-export-roots-setting-eligibility-test
  (testing "query-export-roots with :setting eligibility returns nil when setting disabled"
    (mt/with-temporary-setting-values [remote-sync-transforms false]
      (let [transform-spec (spec/spec-for-model-key :model/Transform)
            tag-spec (spec/spec-for-model-key :model/TransformTag)]
        (is (nil? (spec/query-export-roots transform-spec)))
        (is (nil? (spec/query-export-roots tag-spec)))))))

(deftest query-export-roots-derived-eligibility-test
  (testing "query-export-roots with :published-table eligibility returns nil (derived)"
    (let [table-spec (spec/spec-for-model-key :model/Table)]
      (is (nil? (spec/query-export-roots table-spec)))))

  (testing "query-export-roots with :parent-table eligibility returns nil (derived)"
    (let [field-spec (spec/spec-for-model-key :model/Field)
          segment-spec (spec/spec-for-model-key :model/Segment)
          measure-spec (spec/spec-for-model-key :model/Measure)]
      (is (nil? (spec/query-export-roots field-spec)))
      (is (nil? (spec/query-export-roots segment-spec)))
      (is (nil? (spec/query-export-roots measure-spec))))))

;;; -------------------------------------------- Editability Checking Tests ----------------------------------------

(deftest model-editable?-unknown-model-test
  (testing "model-editable? returns true for models not in the spec"
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (is (true? (spec/model-editable? :model/UnknownModel {}))
          "Unknown models should always be editable"))))

(deftest model-editable?-read-write-mode-test
  (testing "model-editable? returns true in read-write mode regardless of eligibility"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      ;; With library synced, snippet would normally not be editable in read-only mode
      (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
        (is (true? (spec/model-editable? :model/NativeQuerySnippet {}))
            "Snippets should be editable in read-write mode even when library is synced")))))

(deftest model-editable?-library-synced-eligibility-test
  (testing "model-editable? with :library-synced eligibility (NativeQuerySnippet)"
    (testing "returns false when library is synced and mode is read-only"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
          (is (false? (spec/model-editable? :model/NativeQuerySnippet {}))
              "Snippets should NOT be editable when library is synced and mode is read-only"))))

    (testing "returns true when library is NOT synced even in read-only mode"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced false :location "/"}]
          (is (true? (spec/model-editable? :model/NativeQuerySnippet {}))
              "Snippets should be editable when library is NOT synced"))))))

(deftest model-editable?-setting-eligibility-test
  (testing "model-editable? with :setting eligibility (Transform)"
    (testing "returns false when setting is enabled and mode is read-only"
      (mt/with-temporary-setting-values [remote-sync-type :read-only
                                         remote-sync-transforms true]
        (is (false? (spec/model-editable? :model/Transform {}))
            "Transforms should NOT be editable when transforms setting is enabled and mode is read-only")))

    (testing "returns true when setting is disabled even in read-only mode"
      (mt/with-temporary-setting-values [remote-sync-type :read-only
                                         remote-sync-transforms false]
        (is (true? (spec/model-editable? :model/Transform {}))
            "Transforms should be editable when transforms setting is disabled")))))

(deftest model-editable?-collection-eligibility-test
  (testing "model-editable? with :collection eligibility (Card)"
    (testing "returns false when card is in remote-synced collection and mode is read-only"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Synced Collection" :is_remote_synced true :location "/"}]
          (is (false? (spec/model-editable? :model/Card {:collection_id coll-id}))
              "Cards in synced collections should NOT be editable in read-only mode"))))

    (testing "returns true when card is in non-synced collection even in read-only mode"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Normal Collection" :is_remote_synced false :location "/"}]
          (is (true? (spec/model-editable? :model/Card {:collection_id coll-id}))
              "Cards in non-synced collections should be editable"))))))

(deftest model-editable?-nil-instance-test
  (testing "model-editable? works with nil instance for global eligibility models"
    (mt/with-temporary-setting-values [remote-sync-type :read-only
                                       remote-sync-transforms true]
      (is (false? (spec/model-editable? :model/Transform nil))
          "Transforms with nil instance should check setting-based eligibility"))

    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
        (is (false? (spec/model-editable? :model/NativeQuerySnippet nil))
            "Snippets with nil instance should check library-synced eligibility")))))

;;; ------------------------------------------ Batch Eligibility Checking Tests --------------------------------------

(deftest batch-check-eligibility-library-synced-test
  (testing "batch-check-eligibility with :library-synced eligibility"
    (let [spec (spec/spec-for-model-key :model/NativeQuerySnippet)
          instances [{:id 1} {:id 2} {:id 3}]]

      (testing "returns true for all when library is synced"
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
          (let [result (spec/batch-check-eligibility spec instances)]
            (is (= {1 true, 2 true, 3 true} result)))))

      (testing "returns false for all when library is not synced"
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced false :location "/"}]
          (let [result (spec/batch-check-eligibility spec instances)]
            (is (= {1 false, 2 false, 3 false} result))))))))

(deftest batch-check-eligibility-default-test
  (testing "batch-check-eligibility :default falls back to check-eligibility per instance"
    (mt/with-temp [:model/Collection {synced-id :id} {:name "Synced" :is_remote_synced true :location "/"}
                   :model/Collection {not-synced-id :id} {:name "Not Synced" :is_remote_synced false :location "/"}]
      (let [spec (spec/spec-for-model-key :model/Card)
            instances [{:id 1 :collection_id synced-id}
                       {:id 2 :collection_id not-synced-id}
                       {:id 3 :collection_id synced-id}]
            result (spec/batch-check-eligibility spec instances)]
        (is (true? (get result 1)) "Card in synced collection should be eligible")
        (is (false? (get result 2)) "Card in non-synced collection should not be eligible")
        (is (true? (get result 3)) "Card in synced collection should be eligible")))))

;;; ------------------------------------------ Batch Editability Checking Tests --------------------------------------

(deftest batch-model-editable?-unknown-model-test
  (testing "batch-model-editable? returns true for all instances of unknown models"
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (let [instances [{:id 1} {:id 2} {:id 3}]
            result (spec/batch-model-editable? :model/UnknownModel instances)]
        (is (= {1 true, 2 true, 3 true} result))))))

(deftest batch-model-editable?-read-write-mode-test
  (testing "batch-model-editable? returns true for all in read-write mode"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
        (let [instances [{:id 1} {:id 2} {:id 3}]
              result (spec/batch-model-editable? :model/NativeQuerySnippet instances)]
          (is (= {1 true, 2 true, 3 true} result)))))))

(deftest batch-model-editable?-library-synced-test
  (testing "batch-model-editable? with :library-synced eligibility"
    (testing "returns false for all when library is synced and mode is read-only"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced true :location "/"}]
          (let [instances [{:id 1} {:id 2} {:id 3}]
                result (spec/batch-model-editable? :model/NativeQuerySnippet instances)]
            (is (= {1 false, 2 false, 3 false} result))))))

    (testing "returns true for all when library is not synced"
      (mt/with-temporary-setting-values [remote-sync-type :read-only]
        (mt/with-temp [:model/Collection _ {:name "Library" :type "library" :is_remote_synced false :location "/"}]
          (let [instances [{:id 1} {:id 2} {:id 3}]
                result (spec/batch-model-editable? :model/NativeQuerySnippet instances)]
            (is (= {1 true, 2 true, 3 true} result))))))))
