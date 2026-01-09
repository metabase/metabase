(ns metabase-enterprise.metabot-v3.tools.deftool-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot-v3.tools.deftool :as deftool]
   [metabase.util.malli.registry :as mr]))

;;; ---------------------------------------------------- invoke-tool tests ----------------------------------------------------

(deftest ^:parallel invoke-tool-no-args-test
  (testing "invoke-tool with no arguments schema passes metabot-id in args"
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:message "hello"}})
          body          {:conversation_id "conv-123"}
          request       {:metabot-v3/metabot-id "bot-456"}
          opts          {:api-name      :test-tool
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {:metabot-id "bot-456"} @received-args) "Handler should receive metabot-id in args")
      (is (= "conv-123" (:conversation_id result)))
      (is (= {:message "hello"} (:structured_output result)))))

  (testing "invoke-tool with no arguments schema and no metabot-id"
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:message "hello"}})
          body          {:conversation_id "conv-123"}
          request       {}
          opts          {:api-name      :test-tool
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {} @received-args) "Handler should receive empty args when no metabot-id")
      (is (= "conv-123" (:conversation_id result))))))

(deftest ^:parallel invoke-tool-with-args-test
  (testing "invoke-tool with arguments schema that encodes keys"
    (mr/def ::test-args
      [:and
       [:map [:user_id :int]]
       [:map {:encode/tool-api-request #(set/rename-keys % {:user_id :user-id})}]])
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:processed true}})
          body          {:arguments       {:user_id 42}
                         :conversation_id "conv-456"}
          request       {:metabot-v3/metabot-id "bot-789"}
          opts          {:api-name      :test-tool
                         :args-schema   ::test-args
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {:user-id 42, :metabot-id "bot-789"} @received-args)
          "Arguments should be encoded with schema transformer and include metabot-id")
      (is (= "conv-456" (:conversation_id result))))))

(deftest ^:parallel invoke-tool-with-result-decoding-test
  (testing "invoke-tool decodes results using result-schema"
    (mr/def ::test-result
      [:map {:decode/tool-api-response #(set/rename-keys % {:user-name :user_name})}
       [:user_name :string]])
    (let [handler (fn [_args]
                    {:user-name "Alice"})
          body    {:conversation_id "conv-789"}
          request {}
          opts    {:api-name      :test-tool
                   :handler       handler
                   :result-schema ::test-result}
          result (deftool/invoke-tool body request opts)]
      (is (= "Alice" (:user_name result)) "Result should be decoded with schema transformer")
      (is (= "conv-789" (:conversation_id result))))))

;;; ---------------------------------------------------- deftool macro tests ----------------------------------------------------

(deftest ^:parallel deftool-macro-expansion-test
  (testing "deftool macro expands to a defendpoint form"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/test-endpoint"
                                      "Test docstring"
                                      {:args-schema   ::my-args
                                       :result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion) "Should expand to a form")
      (is (= 'metabase.api.macros/defendpoint (first expansion)))
      (is (= :post (second expansion)))
      (is (= "/test-endpoint" (nth expansion 2)))))

  (testing "deftool macro expands correctly for no-args tool"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/no-args"
                                      "No args tool"
                                      {:result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion))
      (is (= 'metabase.api.macros/defendpoint (first expansion)))))

  (testing "deftool macro always includes request in binding vector"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/test"
                                      "Test"
                                      {:result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion))
      ;; The expansion should include 'request' in the binding vector
      (let [binding-vec (nth expansion 6)]
        (is (some #{'request} binding-vec) "Should include request binding")))))
