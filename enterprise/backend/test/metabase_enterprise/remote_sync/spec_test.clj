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
        (is (every? #{:create :update :delete} (get-in spec [:events :types]))
            "events :types should only contain :create, :update, :delete")))))

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
