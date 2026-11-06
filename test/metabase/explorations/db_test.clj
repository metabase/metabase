(ns metabase.explorations.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.db :as explorations.db]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest update-query!-writes-a-query-and-its-stamp-together-test
  (let [mp    (mt/metadata-provider)
        stamp {:dataset_query       (lib/query mp (lib.metadata/table mp (mt/id :venues)))
               :data_access_token   {}
               :resolved_source_ids {:table-ids #{(mt/id :venues)}}}]
    (doseq [k (keys stamp)]
      (testing (str "rejects " k " without the rest of the stamp")
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (explorations.db/update-query! Integer/MAX_VALUE (select-keys stamp [k])))))
      (testing (str "rejects the stamp without " k)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (explorations.db/update-query! Integer/MAX_VALUE (dissoc stamp k))))))
    (testing "accepts the whole stamp, or none of it"
      (is (= 0 (explorations.db/update-query! Integer/MAX_VALUE stamp)))
      (is (= 0 (explorations.db/update-query! Integer/MAX_VALUE {:status "done"}))))))
