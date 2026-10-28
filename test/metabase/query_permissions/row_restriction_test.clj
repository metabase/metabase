(ns metabase.query-permissions.row-restriction-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.permissions.util :as perms.util]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

(deftest remove-row-restricted-card-fingerprints-fails-closed-test
  (testing "a Card whose row restriction can't be resolved loses its fingerprints"
    (mt/with-temp [:model/Card card {:dataset_query   (let [mp (mt/metadata-provider)]
                                                        (lib/query mp (lib.metadata/table mp (mt/id :venues))))
                                     :result_metadata [{:name "X" :fingerprint {:global {:distinct-count 8}}}]}]
      (mt/with-test-user :rasta
        ;; another table of the database is sandboxed, venues is not
        (mt/with-dynamic-fn-redefs [perms.util/sandboxed-user-for-db?   (constantly true)
                                    data-access-token/data-access-token (constantly {})]
          (testing "positive control: venues is open, so the Card keeps them"
            (is (= [card] (query-perms/remove-row-restricted-card-fingerprints [card]))))
          (testing "judged by its database, it loses them"
            (is (= [nil] (->> (perms/remove-row-restricted-card-fingerprints-by-database [card])
                              first :result_metadata (map :fingerprint)))))
          (testing "a Card held without its query has it loaded"
            (is (= [{:global {:distinct-count 8}}]
                   (->> [(select-keys card [:id :database_id :result_metadata])]
                        query-perms/remove-row-restricted-card-fingerprints
                        first :result_metadata (map :fingerprint)))))
          (mt/with-dynamic-fn-redefs [qp.preprocess/preprocess (fn [_] (throw (ex-info "boom" {})))]
            (is (= [nil] (map :fingerprint (:result_metadata (first (query-perms/remove-row-restricted-card-fingerprints [card]))))))))))))
