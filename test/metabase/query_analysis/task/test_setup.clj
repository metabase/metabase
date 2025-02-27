(ns metabase.query-analysis.task.test-setup
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-analysis.core :as query-analysis]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn do-with-test-setup!
  "Set up the data required to test the Query Analysis related tasks"
  [f]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        venues            (lib.metadata/table metadata-provider (mt/id :venues))
        venues-name       (lib.metadata/field metadata-provider (mt/id :venues :name))
        mlv2-query        (-> (lib/query metadata-provider venues)
                              (lib/aggregate (lib/distinct venues-name)))]

    (mt/with-temporary-setting-values [query-analysis-enabled true]
      (mt/with-temp [:model/Card c1       {:query_type    "native"
                                           :dataset_query (mt/native-query {:query "SELECT id FROM venues"})}
                     :model/Card c2       {:query_type    "native"
                                           :dataset_query (mt/native-query {:query         "SELECT id FROM venues WHERE name = {{ name }}"
                                                                            :template-tags {"name" {:id           "_name_"
                                                                                                    :type         :text
                                                                                                    :display-name "name"
                                                                                                    :default      "qwe"}}})}
                     :model/Card c3       {:query_type    "query"
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:distinct $name]]})}
                     :model/Card c4       {:query_type    "query"
                                           :dataset_query mlv2-query}
                     :model/Card archived {:archived      true
                                           :query_type    "native"
                                           :dataset_query (mt/native-query {:query "SELECT id FROM venues"})}
                     :model/Card invalid  {:query_type "native"
                                           :dataset_query (mt/native-query {:query "SELECT boom, FROM"})}]

        ;; Make sure there is no existing analysis for the relevant cards
        (t2/delete! :model/QueryAnalysis :card_id [:in (map :id [c1 c2 c3 c4 archived invalid])])

        ;; Make sure some other card has analysis
        (query-analysis/analyze!* c3)

        ;; And attempt to analyze an invalid query
        (query-analysis/analyze!* invalid)

        (mt/call-with-map-params f [c1 c2 c3 c4 archived invalid])))))

(defmacro with-test-setup!
  "Set up the data required to test the Query Analysis related tasks"
  [& body]
  `(do-with-test-setup!
    (mt/with-anaphora [c1 c2 c3 c4 archived invalid]
      ~@body)))
