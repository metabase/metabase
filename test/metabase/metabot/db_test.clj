(ns metabase.metabot.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.db :as metabot.db]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(deftest ^:parallel card-source-info-columns-excludes-type-test
  (testing (str "A performance cliff with no visible symptom, so pin it. Selecting `:dataset_query` already puts\n"
                "these rows through `upgrade-card-schema-to-latest`; it stays cheap only because\n"
                "`upgrade-card-schema-to 24` short-circuits on `(= :metric (keyword (:type card)))`. Adding `:type`\n"
                "arms it, and it runs `metrics/compute-full-dimension-set` over the query of every un-curated\n"
                "metric on a search page.")
    (is (not (contains? (set @#'metabot.db/card-source-info-columns) :type))
        "see the docstring on card-source-info-columns")))

(deftest table-schema-rows-are-permission-checkable-test
  (testing (str "Callers run `can-query?` / `can-read?` straight on these narrowed rows. Both fall through to\n"
                "`can-access-via-collection?`, which reads `:is_published` and then the parent collection -- so a\n"
                "row missing those columns answers differently from the full row the pk arity fetches. That is a\n"
                "silent under-report for every published table, and search now turns it into a\n"
                "`source_unavailable` marker that contradicts what `metric-details` says about the same metric.")
    (let [table-id (mt/id :orders)
          row      (first (metabot.db/table-schema-rows [table-id]))]
      (is (some? row))
      (testing "the columns the permission path reads are present"
        (is (contains? row :is_published))
        (is (contains? row :collection_id)))
      (testing "and the narrowed row agrees with the full row, for both predicates and both users"
        (doseq [user [:crowberto :rasta]]
          (mt/with-test-user user
            (is (= (mi/can-query? :model/Table table-id) (mi/can-query? row))
                (str "can-query? disagrees for " user))
            (is (= (mi/can-read? :model/Table table-id) (mi/can-read? row))
                (str "can-read? disagrees for " user))))))))

(deftest card-source-info-does-not-arm-the-dimension-set-upgrade-test
  (testing (str "The column list is pinned by the test above, but the thing that makes it matter lives upstream:\n"
                "`upgrade-card-schema-to 24` short-circuits on `(= :metric (keyword (:type card)))`. If that\n"
                "short-circuit ever moves, every search page silently starts computing a full dimension set per\n"
                "un-curated metric -- a large cost with no visible symptom. Arm the expensive call so the day it\n"
                "fires is the day this fails.")
    (mt/with-temp [:model/Card {metric-id :id}
                   {:name          "A metric"
                    :type          :metric
                    :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      (mt/with-dynamic-fn-redefs [metrics/compute-full-dimension-set
                                  (fn [& _] (throw (ex-info "compute-full-dimension-set was armed" {})))]
        (is (some? (metabot.db/card-source-info [metric-id])))))))

(deftest card-source-rows-are-permission-checkable-test
  (testing (str "Callers run `can-read?` straight on these narrowed rows, and the column list now feeds three\n"
                "separate permission gates. `:document_id` especially: `parent-document-permits?` branches on\n"
                "`(contains? card :document_id)`, so present-but-nil and absent mean different things -- drop it\n"
                "and the narrowed row silently takes the pk-resolve path instead of the one it looks like it takes.")
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Private"}
                   :model/Card {card-id :id}
                   {:name "A card" :collection_id coll-id :dataset_query (mt/mbql-query orders)}]
      (let [row (first (metabot.db/card-source-rows #{card-id}))]
        (is (some? row))
        (testing "the columns the permission path reads are present"
          (is (contains? row :collection_id))
          (is (contains? row :document_id)))
        (testing "and the narrowed row agrees with the full row, for a reader and a non-reader"
          (mt/with-test-user :crowberto
            (is (= (mi/can-read? :model/Card card-id) (mi/can-read? row))))
          (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
          (mt/with-test-user :rasta
            (is (= (mi/can-read? :model/Card card-id) (mi/can-read? row)))
            (is (false? (boolean (mi/can-read? row)))
                "and the narrowed row does not make a restricted card look readable")))))))
