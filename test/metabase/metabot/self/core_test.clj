(ns metabase.metabot.self.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.self.core :as core]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel tool-input-part-arguments-test
  (let [part-schema @#'core/AISDKPart
        part        (fn [arguments]
                      {:type :tool-input :id "call-1" :function "some_tool" :arguments arguments})]
    (testing "argument objects nested at any depth may be keyed by keywords or strings"
      (is (mr/validate part-schema (part {:data {:source "c" :limit 20 :sort [{:direction "desc" :property "n"}]}})))
      (is (mr/validate part-schema (part {"data" {"source" "c" "nested" {"deep" [1 2 {"k" true}]}}})))
      (is (mr/validate part-schema (part {:mixed {"string-key" {:keyword-key nil}}}))))
    (testing "non-JSON values are still rejected"
      (is (not (mr/validate part-schema (part {:when (java.util.Date.)})))))))

(deftest ^:parallel tool-entry-deferred-test
  (let [entry {:tool-name "notion__fetch" :schema [:=> [:cat :map] :any] :fn identity
               :deferred  {:group "Notion" :summary "Fetch a page."}}]
    (testing "a deferred tool entry is accepted by the provider request schema"
      (is (mr/validate @#'core/LLMRequestOpts {:model "m" :input [] :tools [entry]})))
    (testing "the deferred map is closed"
      (is (not (mr/validate core/ToolEntry (assoc-in entry [:deferred :extra] 1)))))))
