(ns metabase-enterprise.library-branching.format.old-sync-test
  "The switch (production first): an instance whose base is a commit in the old format pulls a head in the old format,
  then its first push writes the new format."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.old-test-util :as old.tu]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- old-tree
  "`{path bytes}` of snapshot `s` in the old format, at paths of the old layout."
  [s]
  (into {"README.md" (ptu/utf8 "# Our content")}
        (map-indexed (fn [i b] [(str "collections/main/item_" i ".yaml") b]))
        (old.tu/files s)))

(deftest pull-of-an-old-format-head-test
  (mt/with-temporary-setting-values [library-branching-enabled true]
    (with-remote [repo s]
      (let [base   (ptu/remote-commit! repo [] (old-tree ptu/sample))
            inst   (pltu/memory-instance (atom {:snapshot ptu/sample :base base}))
            remote (-> ptu/sample
                       (ptu/renamed ptu/revenue-id "Revenue, net")
                       (dissoc ptu/orders-id))
            head   (ptu/remote-commit! repo [base] (old-tree remote))]
        (testing "production pulls main in the old format: the base and the head decode with the old-format decoder,
                 so the pull applies the remote changes"
          (is (= head (store/head s ptu/branch)))
          (is (claims/old-format? (claims/item-claims (store/read-tree s head))))
          (is (= :pulled (:result (pltu/pull! inst s))))
          (is (= remote (pltu/snapshot-of inst)))
          (is (= head (:base @(:state inst)))))
        (testing "a local change, then the first push: one commit on the old head with the new layout and the format
                 version file"
          (pltu/save! inst #(ptu/renamed % ptu/library-id "Our Library"))
          (let [{:keys [result commit]} (pltu/push! inst s)
                after                   (store/read-tree s commit)]
            (is (= :pushed result))
            (is (= [head] (ptu/commit-parents repo commit)))
            (is (contains? after tree/format-path))
            (is (empty? (:old-items (claims/item-claims after))))
            (is (= (pltu/snapshot-of inst) (ptu/commit-snapshot s commit)))))))))
