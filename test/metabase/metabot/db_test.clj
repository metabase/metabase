(ns metabase.metabot.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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

(deftest card-source-info-classifies-legacy-metrics-test
  (testing (str "Metrics saved before curated dimensions come back un-upgraded on the model: `:card_schema` below\n"
                "24 and no `:dimensions`. Reading their source must neither arm the upgrade to 24, which recomputes\n"
                "the whole dimension set from the query, nor lose the stage structure the classification reads.")
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {source-id :id} {:name          "Orders source"
                                                  :database_id   (mt/id)
                                                  :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}]
        (let [mp       (mt/metadata-provider)
              on-card  (lib/query mp (lib.metadata/card mp source-id))
              metric   (fn [query] {:type :metric, :database_id (mt/id), :dataset_query query})]
          (mt/with-temp [:model/Card {table-metric :id}
                         (metric (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count)))
                         :model/Card {card-metric :id}
                         (metric (lib/aggregate on-card (lib/count)))
                         :model/Card {two-stage-card-metric :id}
                         (metric (-> on-card lib/append-stage (lib/aggregate (lib/count))))]
            (let [metric-ids [table-metric card-metric two-stage-card-metric]]
              ;; A raw UPDATE, because before-insert forces `:card_schema` to current and `with-temp` would
              ;; silently ignore it.
              (t2/query-one {:update :report_card
                             :set    {:card_schema 23, :dimensions nil, :dimension_mappings nil}
                             :where  [:in :id metric-ids]})
              (mt/with-dynamic-fn-redefs [metrics/compute-full-dimension-set
                                          (fn [& _] (throw (ex-info "compute-full-dimension-set was armed" {})))]
                (is (= {table-metric          {:kind :table, :table-id (mt/id :orders), :bare-table-only? false}
                        card-metric           {:kind :card, :card-id source-id}
                        ;; the QP reads the last stage, which carries no `:source-card`: only the base table works
                        two-stage-card-metric {:kind :table, :table-id (mt/id :orders), :bare-table-only? true}}
                       (update-vals (metabot.db/card-source-info metric-ids)
                                    metabot.tools.u/metric-required-source)))))))))))

(deftest card-source-rows-are-permission-checkable-test
  (testing (str "Callers run `can-read?` straight on these narrowed rows, and the column list now feeds three\n"
                "separate permission gates. `:document_id` especially: `parent-document-permits?` branches on\n"
                "`(contains? card :document_id)`, so present-but-nil and absent mean different things -- drop it\n"
                "and the narrowed row silently takes the pk-resolve path instead of the one it looks like it takes.")
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Private"}
                   :model/Card {card-id :id}
                   {:name          "A card"
                    :collection_id coll-id
                    :dataset_query (let [mp (mt/metadata-provider)]
                                     (lib/query mp (lib.metadata/table mp (mt/id :orders))))}]
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
