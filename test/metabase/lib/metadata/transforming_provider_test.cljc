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
              ::test-id
              (tables-transform #(assoc % :schema "transformed"))
              meta/metadata-provider)]
      (is (= "transformed" (:schema (lib.metadata/table mp (meta/id :venues))))))))

(deftest ^:parallel non-table-metadata-passes-through-test
  (testing "non-table metadata is passed through the transform unchanged"
    (let [mp (lib.metadata/transforming-metadata-provider
              ::test-id
              (tables-transform #(assoc % :schema "transformed"))
              meta/metadata-provider)]
      (is (=? {:name "ID"}
              (lib.metadata/field mp (meta/id :venues :id)))))))

(deftest ^:parallel database-delegates-test
  (testing "database metadata delegates to parent"
    (let [mp (lib.metadata/transforming-metadata-provider
              ::test-id
              (tables-transform identity)
              meta/metadata-provider)]
      (is (=? {:id (meta/id)}
              (lib.metadata/database mp))))))

(deftest ^:parallel setting-delegates-test
  (testing "settings delegate to parent"
    (let [mp (lib.metadata/transforming-metadata-provider
              ::test-id
              (tables-transform identity)
              meta/metadata-provider)]
      ;; just verify it doesn't throw — test metadata may not have settings
      (is (nil? (lib.metadata.protocols/setting mp :nonexistent-setting))))))

(deftest ^:parallel identity-transform-test
  (testing "identity transform returns tables unchanged"
    (let [mp (lib.metadata/transforming-metadata-provider
              ::test-id
              (fn [_metadata-spec results] results)
              meta/metadata-provider)]
      (is (=? {:name "VENUES"}
              (lib.metadata/table mp (meta/id :venues)))))))

(deftest ^:parallel equality-test
  (let [f  (fn [_spec results] results)
        mp meta/metadata-provider]
    (testing "equal when transform-id, f, and parent are equal"
      (is (= (lib.metadata/transforming-metadata-provider ::test-id f mp)
             (lib.metadata/transforming-metadata-provider ::test-id f mp))))
    (testing "not equal when f differs"
      (is (not= (lib.metadata/transforming-metadata-provider ::test-id f mp)
                (lib.metadata/transforming-metadata-provider ::test-id (fn [_spec results] results) mp))))
    (testing "not equal when transform-id differs"
      (is (not= (lib.metadata/transforming-metadata-provider ::id-a f mp)
                (lib.metadata/transforming-metadata-provider ::id-b f mp))))))

(deftest ^:parallel all-tables-transformed-test
  (testing "all tables from `tables` are transformed, not just single lookups"
    (let [mp (lib.metadata/transforming-metadata-provider
              ::test-id
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
                            ::test-id
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

(deftest ^:synchronized two-workspaces-share-parent-but-not-general-cache-test
  (testing "Two transforming wrappers around the same parent CachedMetadataProvider"
    (testing "do not collide on cache-value! / cached-value entries keyed by query shape alone"
      (let [parent (lib.metadata.cached-provider/cached-metadata-provider
                    (mock/mock-metadata-provider
                     {:database {:id 1 :name "test-db" :engine :h2}
                      :tables   [{:id 1 :name "VENUES" :schema "PUBLIC" :db-id 1}]}))
            w1 (lib.metadata/transforming-metadata-provider
                ::w1
                (tables-transform #(assoc % :schema "mb__isolation_w1"))
                parent)
            w2 (lib.metadata/transforming-metadata-provider
                ::w2
                (tables-transform #(assoc % :schema "mb__isolation_w2"))
                parent)
            shared-key [::visible-columns :query-A]]
        (testing "W1 writes a derived value under the shared-key"
          (lib.metadata.protocols/cache-value! w1 shared-key {:cols [:id :amount] :for :w1})
          (is (= {:cols [:id :amount] :for :w1}
                 (lib.metadata.protocols/cached-value w1 shared-key :MISS))))
        (testing "W2 looking up the SAME shared-key does NOT see W1's value"
          (is (= :MISS
                 (lib.metadata.protocols/cached-value w2 shared-key :MISS))))
        (testing "W2 can write its own value under the same shared-key without disturbing W1"
          (lib.metadata.protocols/cache-value! w2 shared-key {:cols [:id :amount] :for :w2})
          (is (= {:cols [:id :amount] :for :w1}
                 (lib.metadata.protocols/cached-value w1 shared-key :MISS)))
          (is (= {:cols [:id :amount] :for :w2}
                 (lib.metadata.protocols/cached-value w2 shared-key :MISS))))
        (testing "table metadata is independently transformed per wrapper"
          (is (= "mb__isolation_w1" (:schema (lib.metadata/table w1 1))))
          (is (= "mb__isolation_w2" (:schema (lib.metadata/table w2 1)))))))))

(deftest ^:synchronized store-metadata-rejects-writes-test
  (testing "store-metadata! through the wrapper throws to prevent parent cache corruption"
    (let [parent (lib.metadata.cached-provider/cached-metadata-provider
                  (mock/mock-metadata-provider
                   {:database {:id 1 :name "test-db" :engine :h2}
                    :tables   [{:id 1 :name "VENUES" :schema "PUBLIC" :db-id 1}]}))
          wrapper (lib.metadata/transforming-metadata-provider
                   ::test-id
                   (tables-transform identity)
                   parent)]
      (is (thrown-with-msg?
           #?(:clj clojure.lang.ExceptionInfo :cljs js/Error)
           #"store-metadata! is not supported"
           (lib.metadata.protocols/store-metadata!
            wrapper
            {:lib/type :metadata/table :id 1 :name "VENUES" :schema "TRANSFORMED" :db-id 1}))))))
