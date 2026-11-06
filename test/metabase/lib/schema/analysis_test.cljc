(ns metabase.lib.schema.analysis-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]))

(def ^:private analysis-json
  {"version"          1
   "compiler_version" 1
   "kind"             "habit"
   "columns"          {"timestamp" "CREATED_AT", "person" "USER_ID", "session" nil}
   "settings"         {"date_range" {"type" "relative", "value" -90, "unit" "day"}
                       "grain"      "person"
                       "sub_period" "day"
                       "active"     {"name"    "Big orders"
                                     "filters" [[">"
                                                 {"lib/uuid" "9e1a7b52-1d3c-4e55-9e5f-3b7b7c9e0a01"}
                                                 ["field" {"lib/uuid" "9e1a7b52-1d3c-4e55-9e5f-3b7b7c9e0a02"} 1]
                                                 5]]}
                       "filters"    []}})

(defn- query-json
  []
  {"lib/type" "mbql/query"
   "database" (meta/id)
   "stages"   [{"lib/type" "mbql.stage/mbql", "source-table" (meta/id :orders)}]
   "analysis" analysis-json})

(deftest ^:parallel normalize-test
  (testing "the key reads back from JSON, with its filters as MBQL"
    (let [analysis (:analysis (lib/normalize ::lib.schema/query (query-json)))]
      (is (=? {:kind     "habit"
               :columns  {:timestamp "CREATED_AT"}
               :settings {:date_range {:type "relative"}
                          :active     {:filters [[:> {} [:field {} 1] 5]]}}}
              analysis)))))

(deftest ^:parallel survives-lib-test
  (let [query (lib/query meta/metadata-provider (lib/normalize ::lib.schema/query (query-json)))]
    (testing "a Lib query keeps it, and so does what gets saved"
      (is (contains? query :analysis))
      (is (contains? (lib/prepare-for-serialization query) :analysis)))
    (testing "the legacy form drivers receive doesn't have it"
      (is (not (contains? (lib/->legacy-MBQL query) :analysis))))))
