(ns metabase.collections.create-test
  "Unit tests for the parent-inheritance behavior in `apply-defaults-to-collection`.

  End-to-end coverage at the HTTP boundary is awkward because library collections refuse writes
  and snippet-namespace parents require explicit perms -- both of which would short-circuit before
  the inheritance code runs. These tests bypass write-check via with-redefs so the
  inheritance logic itself is exercised in isolation."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.create :as collections.create]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest apply-defaults-to-collection-test
  (testing "Child inherits :namespace from a non-default-namespace parent"
    (mt/with-temp [:model/Collection parent {:name "Snippet Parent" :namespace "snippets"}]
      (with-redefs [api/write-check (fn [& _])]
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Snippet Child" :parent_id (:id parent)})]
          (is (= :snippets (:namespace defaulted))
              "Namespace propagates from parent when child doesn't specify one")))))
  (testing "Caller's explicit :namespace wins over parent's"
    (mt/with-temp [:model/Collection parent {:name "Snippet Parent 2" :namespace "snippets"}]
      (with-redefs [api/write-check (fn [& _])]
        ;; Caller-provided namespace overrides parent inheritance — REST behavior we mirror.
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Explicit NS Child" :parent_id (:id parent) :namespace "default"})]
          (is (= "default" (:namespace defaulted)))))))
  (testing "Child inherits :type from a library-typed parent"
    (mt/with-temp [:model/Collection parent {:name "Library Parent" :type "library"}]
      (with-redefs [api/write-check (fn [& _])]
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Library Child" :parent_id (:id parent)})]
          (is (= "library" (:type defaulted))
              "Library type propagates so the child stays inside the library hierarchy")))))
  (testing "Child does NOT inherit :type \"trash\" from a trash parent"
    (mt/with-temp [:model/Collection parent {:name "Trashy Parent" :type "trash"}]
      (with-redefs [api/write-check (fn [& _])]
        ;; "trash" is a sentinel for the Trash collection; only library types propagate.
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Not-Trash Child" :parent_id (:id parent)})]
          (is (nil? (:type defaulted))
              "Trash type does not propagate to children")))))
  (testing "Child does NOT inherit :type \"tenant-specific-root-collection\" from a tenant root parent (UXW-4520)"
    (mt/with-temp [:model/Collection parent {:name "Tenant Root" :type "tenant-specific-root-collection"}]
      (with-redefs [api/write-check (fn [& _])]
        ;; The tenant root type is a root-only sentinel; propagating it would fail the closed
        ;; output schema and break tenant sub-collection creation.
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Tenant Sub" :parent_id (:id parent)})]
          (is (nil? (:type defaulted))
              "Tenant root type does not propagate to children")))))
  (testing "Child inherits :is_remote_synced from a remote-synced parent"
    (mt/with-temp [:model/Collection parent {:name "RS Parent" :is_remote_synced true}]
      (with-redefs [api/write-check (fn [& _])]
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "RS Child" :parent_id (:id parent)})]
          (is (true? (:is_remote_synced defaulted))
              "Remote-synced flag propagates so the child participates in remote sync")))))
  (testing "Plain parent: child gets is_remote_synced=false, no type, no namespace"
    (mt/with-temp [:model/Collection parent {:name "Plain Parent"}]
      (with-redefs [api/write-check (fn [& _])]
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Plain Child" :parent_id (:id parent)})]
          (is (false? (:is_remote_synced defaulted)))
          (is (not (contains? defaulted :type)))
          (is (not (contains? defaulted :namespace)))))))
  (testing "Location reflects parent path"
    (mt/with-temp [:model/Collection parent {:name "Path Parent"}]
      (with-redefs [api/write-check (fn [& _])]
        (let [defaulted (collections.create/apply-defaults-to-collection
                         {:name "Path Child" :parent_id (:id parent)})]
          (is (= (str "/" (:id parent) "/") (:location defaulted))))))))

(deftest create-collection!-test
  (testing "Creates a collection and persists inheritance defaults"
    (mt/with-temp [:model/Collection parent {:name "Persist Parent" :is_remote_synced true}]
      (with-redefs [api/write-check (fn [& _])]
        (let [coll (collections.create/create-collection!
                    {:name "Persist Child" :parent_id (:id parent)})]
          (try
            (is (pos-int? (:id coll)))
            (is (= "Persist Child" (:name coll)))
            (is (true? (:is_remote_synced (t2/select-one :model/Collection :id (:id coll))))
                "Persisted child carries the inherited is_remote_synced flag")
            (finally
              (t2/delete! :model/Collection :id (:id coll)))))))))
