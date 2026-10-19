(ns metabase-enterprise.metabot.tools.construct-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.slackbot-query :as slackbot-query]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-query [table]
  {:lib/type "mbql/query"
   :stages [{:lib/type "mbql.stage/mbql"
             :source-table ["Metabot sandbox" "PUBLIC" table]
             :aggregation [["count" {}]]}]})

(defn- sandbox-query []
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                (lib/> (lib.metadata/field mp (mt/id :orders :total)) 10))))

(defn- check-sandbox-attribute-error! [attributes message]
  (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)]
                                              (lib/query mp (lib.metadata/table mp (mt/id :venues))))
                                     :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes attributes}
    (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
    (let [query (count-query "VENUES")]
      (doseq [tool [construct/construct-notebook-query-tool
                    slackbot-query/slackbot-construct-notebook-query-tool]]
        (let [built (get-in (test-util/call-tool tool {:query query :reasoning "count venues"})
                            [:structured-output :query])]
          (is (map? built))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo message (qp/process-query built))))))))

(deftest construct-tools-allow-missing-sandbox-attribute-test
  (check-sandbox-attribute-error! {"something_random" 50} #"Query requires user attribute `cat`"))

(deftest construct-tools-preprocess-sandboxed-queries-test
  (met/with-gtaps! {:gtaps {:orders {:query (sandbox-query)}}}
    (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
    (let [compilations (atom 0)
          executions   (atom 0)
          query        (count-query "ORDERS")]
      (mt/with-dynamic-fn-redefs [qp.compile/compile-preprocessed (fn [& _]
                                                                    (swap! compilations inc)
                                                                    (throw (ex-info "Unexpected SQL compilation" {})))]
        (binding [qp.pipeline/*execute* (fn [& _]
                                          (swap! executions inc)
                                          (throw (ex-info "Unexpected query execution" {})))]
          (doseq [tool [construct/construct-notebook-query-tool
                        slackbot-query/slackbot-construct-notebook-query-tool]]
            (let [built (get-in (test-util/call-tool tool {:query query :reasoning "count orders"})
                                [:structured-output :query])]
              (is (= 1 (lib/stage-count built)))
              (is (= (mt/id :orders) (get-in built [:stages 0 :source-table]))))))
        (is (zero? @compilations))
        (is (zero? @executions))))))

(deftest construct-tools-allow-invalid-sandbox-attribute-test
  (check-sandbox-attribute-error! {"cat" "a"} #"User attribute `cat` value `a` cannot be coerced"))

(deftest construct-tools-load-native-sandbox-metadata-test
  (doseq [tool [construct/construct-notebook-query-tool
                slackbot-query/slackbot-construct-notebook-query-tool]]
    (met/with-gtaps! {:gtaps {:venues {:query (lib/native-query
                                               (mt/metadata-provider)
                                               "SELECT ID, NAME, CATEGORY_ID, PRICE FROM VENUES WHERE PRICE = 1")}}}
      (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
      (let [card-id    (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues))
            executions (atom 0)
            execute    qp.pipeline/*execute*
            query      (count-query "VENUES")]
        (is (nil? (t2/select-one-fn :result_metadata :model/Card :id card-id)))
        (binding [qp.pipeline/*execute* (fn [driver query respond]
                                          (swap! executions inc)
                                          (execute driver query respond))]
          (doseq [expected-executions [1 0]]
            (reset! executions 0)
            (is (map? (get-in (test-util/call-tool tool {:query query :reasoning "count venues"})
                              [:structured-output :query])))
            (is (= expected-executions @executions))
            (is (seq (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))))
