(ns metabase.mcp.v2.tools.content-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(comment metabase.mcp.v2.tools.content/keep-me)

(defn- call-content
  "Invoke get_content through the registry — the same seam the JSON-RPC route uses, so scope
   gating and argument validation are exercised. `token-scopes` of nil means an internal
   caller, which satisfies every scope check."
  ([args] (call-content nil args))
  ([token-scopes args]
   (registry/call-tool token-scopes "test-session" "get_content" args)))

(defn- content-results
  "The `:results` vector from a successful get_content call. Throws when the call was rejected
   before per-item work, so a tool-level error can never masquerade as an empty batch."
  ([args] (content-results nil args))
  ([token-scopes args]
   (let [result (call-content token-scopes args)]
     (when (:isError result)
       (throw (ex-info (str "get_content returned a tool-level error: "
                            (-> result :content first :text))
                       {:result result})))
     (:results (json/decode+kw (-> result :content first :text))))))

(defn- content-one
  ([args] (content-one nil args))
  ([token-scopes args] (first (content-results token-scopes args))))

(deftest get-content-question-concise-test
  (testing "GHY-4140: a question read returns its concise projection with the type tag"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Venue Count"
                                              :type          :question
                                              :display       :scalar
                                              :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-test-user :crowberto
        (let [row (content-one {:items [{:type "question" :id card-id}]})]
          (is (nil? (:error row)))
          (is (= "question" (:type row)))
          (is (= card-id (:id row)))
          (is (= "Venue Count" (:name row)))
          (testing "concise omits the detailed-only columns"
            (is (nil? (:entity_id row)))
            (is (nil? (:created_at row)))))))))
