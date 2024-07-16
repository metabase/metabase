(ns metabase.task.analyze-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.query-analysis :as query-analysis]
   [metabase.task.analyze-queries :as task.analyze-queries]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.queue :as queue]
   [toucan2.core :as t2]))

(deftest analyzer-loop-test
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        venues            (lib.metadata/table metadata-provider (mt/id :venues))
        venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
        mlv2-query        (-> (lib/query metadata-provider venues)
                              (lib/aggregate (lib/distinct venues-name)))]
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

      (let [card-ids (map :id [c1 c2 c3 c4 arch])]

        ;; emulate "cards created before QueryField existed"
        (t2/delete! :model/QueryField :card_id [:in card-ids])
        (queue/clear! @#'query-analysis/queue)

        ;; `(first (vals %))` is necessary since h2 generates `:count(id)` as a name for the column
        (let [get-count #(t2/select-one-fn (comp first vals) [:model/QueryField [[:count :id]]] :card_id %)]
          (testing "QueryField is empty - queries weren't analyzed"
            (is (every? zero? (map get-count card-ids))))

          ;; queue the cards
          (binding [query-analysis/*analyze-queries-in-test?* true]
            (run! query-analysis/analyze-async! card-ids))

          ;; run the analysis for 1s
          (try
            (u/with-timeout 1000
              (#'task.analyze-queries/analyzer-loop!))
            (catch Exception _))

          (testing "QueryField is filled now"
            (testing "for a native query"
              (is (pos? (get-count (:id c1)))))
            (testing "for a native query with template tags"
              (is (pos? (get-count (:id c2)))))
            (testing "for an MBQL"
              (is (pos? (get-count (:id c3)))))
            (testing "for an MLv2"
              (is (pos? (get-count (:id c4)))))
            (testing "but not for an archived card"
              (is (zero? (get-count (:id arch)))))))))))
