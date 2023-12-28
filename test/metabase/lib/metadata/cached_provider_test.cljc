(ns metabase.lib.metadata.cached-provider-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(deftest ^:parallel caching-test
  (let [fetch-count (atom 0)
        provider    (lib.metadata.cached-provider/cached-metadata-provider
                     (reify
                       lib.metadata.protocols/MetadataProvider
                       (table [_this id]
                         (swap! fetch-count inc)
                         {:id id})

                       lib.metadata.protocols/BulkMetadataProvider
                       (bulk-metadata [_this metadata-type ids]
                         (case metadata-type
                           :metadata/table (for [id ids]
                                             (do
                                               (swap! fetch-count inc)
                                               {:id id}))))))]
    (testing "Initial fetch"
      (is (= {:id 1}
             (lib.metadata.protocols/table provider 1)))
      (is (= 1
             @fetch-count)))
    (testing "Second fetch"
      (is (= {:id 1}
             (lib.metadata.protocols/table provider 1)))
      (is (= 1
             @fetch-count)))
    (testing "Second fetch"
      (is (= {:id 1}
             (lib.metadata.protocols/table provider 1)))
      (is (= 1
             @fetch-count)))
    (testing "Bulk fetch"
      (is (= [{:id 1}]
             (lib.metadata.protocols/bulk-metadata provider :metadata/table #{1})))
      (is (= 1
             @fetch-count))
      (testing "Fetch a new Table, 1 Table already fetched"
        (is (= [{:id 1}
                {:id 2}]
               (lib.metadata.protocols/bulk-metadata provider :metadata/table #{1 2})))
        (is (= 2
               @fetch-count)))
      (testing "Bulk fetch again, should use cached results"
        (is (= [{:id 1}
                {:id 2}]
               (lib.metadata.protocols/bulk-metadata provider :metadata/table #{1 2})))
        (is (= 2
               @fetch-count))))))
