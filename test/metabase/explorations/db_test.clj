(ns metabase.explorations.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.models.exploration-query :as exploration-query]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest update-queries!-writes-query-and-stamp-together-test
  (let [mp    (mt/metadata-provider)
        stamp {:dataset_query       (lib/query mp (lib.metadata/table mp (mt/id :venues)))
               :data_access_token   {}
               :resolved_source_ids {:table-ids #{(mt/id :venues)}}}]
    (doseq [k (keys stamp)]
      (testing (str "rejects " k " without the rest of the stamp")
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (exploration-query/update-queries! [(assoc (select-keys stamp [k]) :id Integer/MAX_VALUE)]))))
      (testing (str "rejects the stamp without " k)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"go together"
                              (exploration-query/update-queries! [(assoc (dissoc stamp k) :id Integer/MAX_VALUE)])))))
    (testing "accepts the whole stamp, or none of it"
      (is (= 0 (exploration-query/update-queries! [(assoc stamp :id Integer/MAX_VALUE)])))
      (is (= 0 (exploration-query/update-queries! [{:id Integer/MAX_VALUE :status "done"}]))))))
