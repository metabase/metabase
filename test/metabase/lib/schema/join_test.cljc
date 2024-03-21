(ns metabase.lib.schema.join-test
  (:require
   [clojure.test :refer [deftest is]]
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util.malli.humanize :as mu.humanize]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-schema-test
  (is (=? {:stages ["should have at least 1 elements" ["end of input"]]}
          (mu.humanize/humanize (mc/explain ::lib.schema.join/join {:stages []}))))
  ;; not sure why these errors are repeated.
  (is (=? {:stages [[{:joins [{:stages [[{:lib/type "missing required key"}
                                         "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"]]}]}
                     "An initial MBQL stage of a query must have :source-table, :source-card, or :sources."]]}
          (mu.humanize/humanize (mc/explain ::lib.schema/query {:stages [{:lib/type :mbql.stage/mbql
                                                                          :joins    [{:lib/type :mbql/join
                                                                                      :stages   [{}]}]}]})))))
