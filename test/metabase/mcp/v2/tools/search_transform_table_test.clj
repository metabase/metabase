(ns ^:mb/driver-tests metabase.mcp.v2.tools.search-transform-table-test
  "MCP v2 has no transforms, but the table a transform run writes is an ordinary table. These tests prove that
   search still finds it. A run needs a warehouse driver with `:transforms/table`, so they are driver tests."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.test-util :as v2.tu]
   [metabase.mcp.v2.tools.search :as tools.search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-util :as transforms.tu]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest transform-output-table-is-searchable-test
  (testing "GHY-4746: with transforms gone from MCP v2, the table a transform run writes is still an ordinary table, so
            search finds it with type: [\"table\"]"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [schema (t2/select-one-fn :schema :model/Table (mt/id :venues))]
        (transforms.tu/with-transform-cleanup! [{target-name :name :as target} {:type   "table"
                                                                                :schema schema
                                                                                :name   "mcp_search_target"}]
          (let [mp        (mt/metadata-provider)
                ;; Not mt/with-temp: its transaction cannot hold the DDL that building the index runs on an H2
                ;; app DB. with-transform-cleanup! deletes the transform and drops the target table.
                transform (t2/insert-returning-instance! :model/Transform
                                                         {:name   "MCP search transform"
                                                          :source {:type  :query
                                                                   :query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
                                                          :target target})
                _         (transforms.execute/execute! transform {:run-method :manual})
                table     (transforms.tu/wait-for-table target-name
                                                        (* 1000 transforms.tu/transform-run-timeout-seconds))]
            (is (= :metabase-transform (:data_source table))
                "sanity: the run marked the table as built by a transform")
            ;; Builds the index after the run, so the output table is in it.
            (search.tu/with-appdb-search-if-available*
              (mt/with-current-user (mt/user->id :crowberto)
                (let [content (tools.search/search-tool {:term_queries [target-name] :type ["table"]}
                                                        {:token-scopes #{"agent:content:read"}})
                      rows    (-> content :content first :text v2.tu/strip-data-boundary json/decode+kw :data)]
                  (is (not (:isError content)))
                  (is (some #(and (= "table" (:type %)) (= (:id table) (:id %))) rows)
                      (str "the output table is in the results: " (pr-str rows))))))))))))
