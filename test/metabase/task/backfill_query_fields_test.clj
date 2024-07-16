(ns metabase.task.backfill-query-fields-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.query-analysis :as query-analysis]
   [metabase.task.backfill-query-fields :as backfill]
   [metabase.test :as mt]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]))


(deftest backfill-query-field-test
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        venues            (lib.metadata/table metadata-provider (mt/id :venues))
        venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
        mlv2-query        (-> (lib/query metadata-provider venues)
                              (lib/aggregate (lib/distinct venues-name)))
        analyzed-card-id  (t2/select-one-fn :card_id :model/QueryField)]

    (mt/with-temp [Card c1   {:query_type    "native"
                              :dataset_query (mt/native-query {:query "SELECT id FROM venues"})}
                   Card c2   {:query_type    "native"
                              :dataset_query (mt/native-query {:query         "SELECT id FROM venues WHERE name = {{ name }}"
                                                               :template-tags {"name" {:id           "_name_"
                                                                                       :type         :text
                                                                                       :display-name "name"
                                                                                       :default      "qwe"}}})}
                   Card c3   {:query_type    "query"
                              :dataset_query (mt/mbql-query venues {:aggregation [[:distinct $name]]})}
                   Card c4   {:query_type    "query"
                              :dataset_query mlv2-query}
                   Card arch {:archived      true
                              :query_type    "native"
                              :dataset_query (mt/native-query {:query "SELECT id FROM venues"})}]

      ;; Make sure there is no existing analysis for the relevant cards
      (t2/delete! :model/QueryField :card_id [:in (map :id [c1 c2 c3 c4 arch])])

      ;; Make sure some other card has analysis
      (testing "There is at least one card with existing analysis"
        (is (pos? (count (t2/select :model/QueryField :card_id analyzed-card-id)))))

      (let [queued-ids   (atom #{})
            expected-ids (into #{} (map :id) [c1 c2 c3 c4])]

        ;; Run the backfill with a mocked out publisher
        (query-analysis/with-queued-analysis
          (#'backfill/backfill-missing-query-fields!
           #(swap! queued-ids conj (:id %))))

        (testing "The expected cards were all sent to the analyzer"
          (is (= expected-ids (set/intersection expected-ids @queued-ids))))

        (testing "The card with existing analysis was not sent to the analyzer again"
          (is (not (@queued-ids analyzed-card-id))))))))


(comment
  (set! *warn-on-reflection* true)
  (queue/clear! @#'query-analysis/queue)
  (.-queued-set @#'query-analysis/queue)
  (.peek (.-async-queue @#'query-analysis/queue))
  (.peek (.-sync-queue @#'query-analysis/queue)))
