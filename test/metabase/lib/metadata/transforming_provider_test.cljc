(ns metabase.lib.metadata.transforming-provider-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.mock :as mock]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- tables-transform
  "A transform that applies `f` to each table, passes other metadata types through."
  [f]
  (fn [{metadata-type :lib/type} results]
    (if (= metadata-type :metadata/table)
      (into [] (map f) results)
      results)))

(deftest ^:parallel transforms-tables-test
  (testing "transform function is applied to table metadata"
    (let [mp (lib.metadata/transforming-metadata-provider
              (tables-transform #(assoc % :schema "transformed"))
              meta/metadata-provider)]
      (is (= "transformed" (:schema (lib.metadata/table mp (meta/id :venues))))))))

(deftest ^:parallel non-table-metadata-passes-through-test
  (testing "non-table metadata is passed through the transform unchanged"
    (let [mp (lib.metadata/transforming-metadata-provider
              (tables-transform #(assoc % :schema "transformed"))
              meta/metadata-provider)]
      (is (=? {:name "ID"}
              (lib.metadata/field mp (meta/id :venues :id)))))))

(deftest ^:parallel database-delegates-test
  (testing "database metadata delegates to parent"
    (let [mp (lib.metadata/transforming-metadata-provider
              (tables-transform identity)
              meta/metadata-provider)]
      (is (=? {:id (meta/id)}
              (lib.metadata/database mp))))))

(deftest ^:parallel setting-delegates-test
  (testing "settings delegate to parent"
    (let [mp (lib.metadata/transforming-metadata-provider
              (tables-transform identity)
              meta/metadata-provider)]
      ;; just verify it doesn't throw — test metadata may not have settings
      (is (nil? (lib.metadata.protocols/setting mp :nonexistent-setting))))))

(deftest ^:parallel identity-transform-test
  (testing "identity transform returns tables unchanged"
    (let [mp (lib.metadata/transforming-metadata-provider
              (fn [_metadata-spec results] results)
              meta/metadata-provider)]
      (is (=? {:name "VENUES"}
              (lib.metadata/table mp (meta/id :venues)))))))

(deftest ^:parallel equality-test
  (let [f  (fn [_spec results] results)
        mp meta/metadata-provider]
    (testing "equal when f and parent are equal"
      (is (= (lib.metadata/transforming-metadata-provider f mp)
             (lib.metadata/transforming-metadata-provider f mp))))
    (testing "not equal when f differs"
      (is (not= (lib.metadata/transforming-metadata-provider f mp)
                (lib.metadata/transforming-metadata-provider (fn [_spec results] results) mp))))))

(deftest ^:parallel all-tables-transformed-test
  (testing "all tables from `tables` are transformed, not just single lookups"
    (let [mp (lib.metadata/transforming-metadata-provider
              (tables-transform #(assoc % :schema "ws"))
              meta/metadata-provider)]
      (is (every? #(= "ws" (:schema %)) (lib.metadata/tables mp))))))

(deftest ^:parallel cached-values-do-not-leak-through-test
  (testing "stale cached values from the parent don't bypass the transform"
    (let [base-mp   (mock/mock-metadata-provider
                     {:database {:id 1 :name "test-db" :engine :h2}
                      :tables   [{:id 1 :name "VENUES" :schema "PUBLIC" :db-id 1}]})
          cached-mp (lib.metadata.cached-provider/cached-metadata-provider base-mp)]
      ;; warm the parent cache
      (testing "parent cache has the original value"
        (is (= "PUBLIC" (:schema (lib.metadata/table cached-mp 1))))
        (is (= "VENUES" (:name (first (lib.metadata.protocols/cached-metadatas cached-mp :metadata/table [1]))))))
      ;; now wrap with a transform
      (let [transformed-mp (lib.metadata/transforming-metadata-provider
                            (tables-transform #(assoc % :schema "workspace_schema" :name "workspace_venues"))
                            cached-mp)]
        (testing "metadatas path returns transformed values"
          (let [t (lib.metadata/table transformed-mp 1)]
            (is (= "workspace_schema" (:schema t)))
            (is (= "workspace_venues" (:name t)))))
        (testing "cached-metadatas also returns transformed values (not stale parent cache)"
          ;; fetch once through metadatas to populate the transforming provider's own cache
          (lib.metadata/table transformed-mp 1)
          (let [cached (first (lib.metadata.protocols/cached-metadatas transformed-mp :metadata/table [1]))]
            (is (= "workspace_schema" (:schema cached)))
            (is (= "workspace_venues" (:name cached)))))))))
