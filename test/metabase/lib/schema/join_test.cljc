(ns metabase.lib.schema.join-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-schema-test
  (is (=? {:stages ["should have at least 1 elements" ["end of input"]]}
          (mu.humanize/humanize (mr/explain ::lib.schema.join/join {:stages []}))))
  ;; not sure why these errors are repeated.
  (is (=? {:lib/type "missing required key"
           :stages [{:joins [{:stages [[{:lib/type "missing required key"}
                                        "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"]]
                              :lib/options "missing required key"
                              :conditions  "should have at least 1 elements"}]}]}
          (mu.humanize/humanize (mr/explain ::lib.schema/query {:stages [{:lib/type :mbql.stage/mbql
                                                                          :joins    [{:lib/type :mbql/join
                                                                                      :stages   [{}]
                                                                                      :conditions []
                                                                                      :alias      "join alias"}]}]})))))
