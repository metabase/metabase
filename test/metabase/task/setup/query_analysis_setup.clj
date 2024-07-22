(ns metabase.task.setup.query-analysis-setup
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models :refer [Card]]
   [metabase.query-analysis :as query-analysis]
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
                  (query-analysis/analyze-card! c3)

                  (mt/call-with-map-params f [c1 c2 c3 c4 arch]))))

(defmacro with-test-setup!
  "Set up the data required to test the Query Analysis related tasks"
  [& body]
  `(do-with-test-setup!
    (mt/with-anaphora [c1 c2 c3 c4 arch]
      ~@body)))
