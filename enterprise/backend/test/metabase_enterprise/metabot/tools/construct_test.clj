(ns metabase-enterprise.metabot.tools.construct-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.slackbot-query :as slackbot-query]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- sandbox-query []
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                (lib/> (lib.metadata/field mp (mt/id :orders :total)) 10))))

(deftest construct-tools-preprocess-sandboxed-queries-test
  (met/with-gtaps! {:gtaps {:orders {:query (sandbox-query)}}}
    (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
    (let [query {:lib/type "mbql/query"
                 :stages [{:lib/type "mbql.stage/mbql"
                           :source-table ["Metabot sandbox" "PUBLIC" "ORDERS"]
                           :aggregation [["count" {}]]}]}]
      (mt/with-dynamic-fn-redefs [qp/compile (fn [& _] (throw (ex-info "Unexpected SQL compilation" {})))
                                  qp/process-query (fn [& _] (throw (ex-info "Unexpected query execution" {})))]
        (doseq [tool [construct/construct-notebook-query-tool
                      slackbot-query/slackbot-construct-notebook-query-tool]]
          (let [built (get-in (test-util/call-tool tool {:query query :reasoning "count orders"})
                              [:structured-output :query])]
            (is (= 1 (lib/stage-count built)))
            (is (= (mt/id :orders) (get-in built [:stages 0 :source-table])))))))))
